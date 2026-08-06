"""Backup e restauração — funcionais, não simulados.

O que cada execução produz no destino:

    govdoc-<AAAAMMDD-HHMMSS>-<tipo>/
        database.sql       dump do PostgreSQL (quando pg_dump está disponível)
        database.json      dump lógico das tabelas do módulo (sempre)
        metadata.json      documentos, versões e pastas (permite restauração seletiva)
        files/<versao>/...  cópia binária de cada versão de arquivo
        manifest.json      inventário com SHA-256 de cada item
        manifest.sha256    hash do próprio manifesto

A verificação relê o manifesto, confere hash e tamanho de cada arquivo e grava o
resultado em `integrity_checks`. Só depois disso o backup é considerado válido.
"""

import asyncio
import hashlib
import json
import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError
from app.core.storage import get_storage
from app.models.document import Document, DocumentVersion
from app.models.enums import BackupStatus, BackupType, ConflictStrategy, RestoreStatus
from app.models.folder import Folder
from app.models.governance import (
    BackupExecution,
    BackupJob,
    IntegrityCheck,
    RestoreJob,
)
from app.models.user import User

logger = logging.getLogger("govdoc.backup")

MANIFEST_NAME = "manifest.json"
MANIFEST_HASH_NAME = "manifest.sha256"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _serialize(value):
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _row_to_dict(obj) -> dict:
    return {
        column.name: _serialize(getattr(obj, column.name))
        for column in obj.__table__.columns
    }


def resolve_destination(job_destination: str) -> str:
    destination = job_destination or settings.BACKUP_DESTINATION
    if not destination:
        raise AppError(
            "Nenhum destino de backup configurado. Defina BACKUP_DESTINATION "
            "(disco secundário, NAS ou repositório S3) antes de executar o backup.",
            422,
            "destino_backup_ausente",
        )
    return destination


def destination_warning(destination: str) -> Optional[str]:
    """Avisa quando o backup ficaria dentro da própria aplicação."""
    if destination.startswith("s3://"):
        return None
    app_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    storage_root = os.path.abspath(settings.STORAGE_LOCAL_PATH)
    target = os.path.abspath(destination)
    if target.startswith(storage_root):
        return (
            "O destino escolhido está dentro do próprio armazenamento de arquivos. "
            "Configure um destino externo para atender à regra 3-2-1."
        )
    if target.startswith(app_root):
        return (
            "O destino escolhido está dentro da pasta da aplicação. "
            "Uma falha de disco levaria os dados e o backup juntos."
        )
    return None


# ── Execução do backup ───────────────────────────────────────────────────────


async def _dump_database_sql(target_dir: str) -> Optional[dict]:
    """Dump consistente via pg_dump. Retorna None se a ferramenta não existir."""
    if settings.DATABASE_URL_OVERRIDE or "postgresql" not in settings.DATABASE_URL:
        return None
    if shutil.which(settings.PG_DUMP_PATH) is None:
        logger.warning("pg_dump não encontrado — usando apenas o dump lógico JSON")
        return None

    path = os.path.join(target_dir, "database.sql")
    env = dict(os.environ, PGPASSWORD=settings.POSTGRES_PASSWORD.get_secret_value())
    command = [
        settings.PG_DUMP_PATH,
        "-h", settings.POSTGRES_HOST,
        "-p", str(settings.POSTGRES_PORT),
        "-U", settings.POSTGRES_USER,
        "-d", settings.POSTGRES_DB,
        "--no-owner",
        "--no-privileges",
        "-f", path,
    ]

    def _run():
        return subprocess.run(command, env=env, capture_output=True, timeout=3600)

    result = await asyncio.get_running_loop().run_in_executor(None, _run)
    if result.returncode != 0:
        raise AppError(
            "Falha ao gerar o dump do banco de dados: "
            + result.stderr.decode("utf-8", "replace")[:300],
            500,
            "falha_dump",
        )
    return _file_entry(path, target_dir)


async def _dump_database_json(db: AsyncSession, target_dir: str, institution_id) -> dict:
    """Dump lógico das tabelas do módulo — portátil e legível."""
    from app.models import Base

    payload = {}
    for table_name, table in Base.metadata.tables.items():
        rows = (await db.execute(select(table))).mappings().all()
        payload[table_name] = [
            {key: _serialize(value) for key, value in row.items()} for row in rows
        ]
    path = os.path.join(target_dir, "database.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)
    return _file_entry(path, target_dir)


def _file_entry(path: str, root: str) -> dict:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return {
        "caminho": os.path.relpath(path, root).replace(os.sep, "/"),
        "sha256": digest.hexdigest(),
        "bytes": os.path.getsize(path),
    }


async def run_backup(
    db: AsyncSession,
    *,
    job: BackupJob,
    user: Optional[User] = None,
    backup_type: Optional[str] = None,
) -> BackupExecution:
    backup_type = backup_type or job.backup_type
    destination = resolve_destination(job.destination)

    execution = BackupExecution(
        job_id=job.id,
        backup_type=backup_type,
        status=BackupStatus.EM_EXECUCAO.value,
        started_at=_now(),
        triggered_by_id=user.id if user else None,
    )
    db.add(execution)
    await db.flush()

    stamp = _now().strftime("%Y%m%d-%H%M%S")
    folder_name = f"govdoc-{stamp}-{backup_type}"
    staging = tempfile.mkdtemp(prefix="govdoc-backup-")
    work_dir = os.path.join(staging, folder_name)
    os.makedirs(os.path.join(work_dir, "files"), exist_ok=True)

    entries: list = []
    warnings: list = []
    try:
        if job.include_database:
            sql_entry = await _dump_database_sql(work_dir)
            if sql_entry:
                entries.append(sql_entry)
            else:
                warnings.append(
                    "pg_dump indisponível — o backup contém apenas o dump lógico JSON."
                )
            entries.append(await _dump_database_json(db, work_dir, job.institution_id))

        since = None
        if backup_type == BackupType.INCREMENTAL.value:
            last = await db.scalar(
                select(BackupExecution)
                .where(
                    BackupExecution.job_id == job.id,
                    BackupExecution.status.in_(
                        [
                            BackupStatus.CONCLUIDO.value,
                            BackupStatus.CONCLUIDO_COM_ALERTA.value,
                        ]
                    ),
                )
                .order_by(BackupExecution.started_at.desc())
                .limit(1)
            )
            since = last.started_at if last else None

        documents_meta = []
        versions_meta = []
        file_count = 0
        if job.include_files:
            storage = get_storage()
            stmt = (
                select(DocumentVersion, Document)
                .join(Document, Document.id == DocumentVersion.document_id)
                .where(Document.institution_id == job.institution_id)
            )
            if since is not None:
                stmt = stmt.where(DocumentVersion.created_at > since)
            rows = (await db.execute(stmt)).all()
            for version, document in rows:
                target = os.path.join(work_dir, "files", str(version.id))
                os.makedirs(target, exist_ok=True)
                file_path = os.path.join(target, "conteudo.bin")
                try:
                    data = await storage.get(version.storage_key)
                except Exception as exc:
                    warnings.append(
                        f"Arquivo ausente no armazenamento: versão {version.version_number} "
                        f"do documento {document.code} ({exc.__class__.__name__})"
                    )
                    continue
                with open(file_path, "wb") as fh:
                    fh.write(data)
                entry = _file_entry(file_path, work_dir)
                entry.update(
                    {
                        "version_id": str(version.id),
                        "document_id": str(document.id),
                        "storage_key": version.storage_key,
                        "sha256_origem": version.sha256,
                    }
                )
                if entry["sha256"] != version.sha256:
                    warnings.append(
                        f"Divergência de hash na versão {version.version_number} "
                        f"do documento {document.code}"
                    )
                entries.append(entry)
                versions_meta.append(_row_to_dict(version))
                file_count += 1

            document_ids = {v["document_id"] for v in versions_meta}
            if document_ids:
                docs = (
                    await db.scalars(
                        select(Document).where(
                            Document.id.in_([uuid.UUID(d) for d in document_ids])
                        )
                    )
                ).all()
                documents_meta = [_row_to_dict(d) for d in docs]

        folders = (
            await db.scalars(
                select(Folder).where(Folder.institution_id == job.institution_id)
            )
        ).all()
        metadata = {
            "instituicao": str(job.institution_id),
            "gerado_em": _now().isoformat(),
            "documentos": documents_meta,
            "versoes": versions_meta,
            "pastas": [_row_to_dict(f) for f in folders],
        }
        metadata_path = os.path.join(work_dir, "metadata.json")
        with open(metadata_path, "w", encoding="utf-8") as fh:
            json.dump(metadata, fh, ensure_ascii=False)
        entries.append(_file_entry(metadata_path, work_dir))

        manifest = {
            "versao_formato": 1,
            "modulo": "govdoc",
            "tipo": backup_type,
            "job": str(job.id),
            "execucao": str(execution.id),
            "instituicao": str(job.institution_id),
            "gerado_em": _now().isoformat(),
            "desde": since.isoformat() if since else None,
            "itens": entries,
            "total_bytes": sum(e["bytes"] for e in entries),
            "total_arquivos": file_count,
            "avisos": warnings,
        }
        manifest_bytes = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
        with open(os.path.join(work_dir, MANIFEST_NAME), "wb") as fh:
            fh.write(manifest_bytes)
        manifest_hash = hashlib.sha256(manifest_bytes).hexdigest()
        with open(os.path.join(work_dir, MANIFEST_HASH_NAME), "w", encoding="utf-8") as fh:
            fh.write(manifest_hash)

        if settings.BACKUP_ENCRYPTION_PASSWORD.get_secret_value() and job.encrypt:
            _encrypt_directory(work_dir, settings.BACKUP_ENCRYPTION_PASSWORD.get_secret_value())

        final_path = await _publish(work_dir, destination, folder_name)

        execution.status = (
            BackupStatus.CONCLUIDO_COM_ALERTA.value if warnings else BackupStatus.CONCLUIDO.value
        )
        execution.destination = final_path
        execution.total_bytes = manifest["total_bytes"]
        execution.file_count = file_count
        execution.manifest_sha256 = manifest_hash
        execution.message = "; ".join(warnings)[:2000] if warnings else "Backup concluído."
        aviso_destino = destination_warning(destination)
        if aviso_destino:
            execution.message = f"{execution.message} {aviso_destino}"
            execution.status = BackupStatus.CONCLUIDO_COM_ALERTA.value
    except Exception as exc:
        logger.exception("Falha no backup")
        execution.status = BackupStatus.FALHOU.value
        execution.message = str(exc)[:2000]
    finally:
        execution.finished_at = _now()
        execution.duration_seconds = (
            execution.finished_at - execution.started_at
        ).total_seconds()
        shutil.rmtree(staging, ignore_errors=True)
        job.last_run_at = execution.finished_at
        await db.flush()

    return execution


def _encrypt_directory(work_dir: str, password: str) -> None:
    """Criptografa os arquivos do backup com AES-GCM derivado da senha (scrypt)."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    salt = os.urandom(16)
    key = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    aes = AESGCM(key)
    with open(os.path.join(work_dir, "encryption.salt"), "wb") as fh:
        fh.write(salt)
    for root, _dirs, files in os.walk(work_dir):
        for name in files:
            if name in {"encryption.salt", MANIFEST_NAME, MANIFEST_HASH_NAME}:
                continue
            path = os.path.join(root, name)
            with open(path, "rb") as fh:
                data = fh.read()
            nonce = os.urandom(12)
            with open(path + ".enc", "wb") as fh:
                fh.write(nonce + aes.encrypt(nonce, data, None))
            os.remove(path)


async def _publish(work_dir: str, destination: str, folder_name: str) -> str:
    """Copia o diretório pronto para o destino final (pasta local ou S3)."""
    if destination.startswith("s3://"):
        import boto3

        without_scheme = destination[5:]
        bucket, _, prefix = without_scheme.partition("/")
        client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT or None,
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY.get_secret_value() or None,
            aws_secret_access_key=settings.S3_SECRET_KEY.get_secret_value() or None,
        )
        loop = asyncio.get_running_loop()
        for root, _dirs, files in os.walk(work_dir):
            for name in files:
                local = os.path.join(root, name)
                rel = os.path.relpath(local, work_dir).replace(os.sep, "/")
                key = "/".join(part for part in [prefix.strip("/"), folder_name, rel] if part)
                await loop.run_in_executor(
                    None, lambda p=local, k=key: client.upload_file(p, bucket, k)
                )
        return f"{destination.rstrip('/')}/{folder_name}"

    os.makedirs(destination, exist_ok=True)
    final_path = os.path.join(destination, folder_name)
    if os.path.exists(final_path):
        shutil.rmtree(final_path)
    shutil.copytree(work_dir, final_path)
    return final_path


# ── Verificação ──────────────────────────────────────────────────────────────


async def verify_execution(
    db: AsyncSession, *, execution: BackupExecution, user: Optional[User] = None
) -> IntegrityCheck:
    """Relê o backup do disco e confere hash de cada item (teste de leitura real)."""
    path = execution.destination
    details = {"erros": [], "faltando": []}
    checked = ok = failed = missing = 0

    if not path or path.startswith("s3://") or not os.path.isdir(path):
        execution.verify_result = (
            "Destino não acessível para verificação automática nesta instância."
        )
        check = IntegrityCheck(
            scope="backup",
            execution_id=execution.id,
            checked_count=0,
            failed_count=1,
            details={"erro": execution.verify_result},
            triggered_by_id=user.id if user else None,
        )
        db.add(check)
        await db.flush()
        return check

    manifest_path = os.path.join(path, MANIFEST_NAME)
    if not os.path.exists(manifest_path):
        execution.verify_result = "Manifesto ausente — backup inválido."
        check = IntegrityCheck(
            scope="backup",
            execution_id=execution.id,
            failed_count=1,
            details={"erro": execution.verify_result},
            triggered_by_id=user.id if user else None,
        )
        db.add(check)
        await db.flush()
        return check

    with open(manifest_path, "rb") as fh:
        manifest_bytes = fh.read()
    manifest_hash = hashlib.sha256(manifest_bytes).hexdigest()
    if execution.manifest_sha256 and manifest_hash != execution.manifest_sha256:
        details["erros"].append("O manifesto foi alterado após a geração do backup.")
        failed += 1

    manifest = json.loads(manifest_bytes.decode("utf-8"))
    for item in manifest.get("itens", []):
        checked += 1
        item_path = os.path.join(path, item["caminho"])
        if not os.path.exists(item_path):
            missing += 1
            details["faltando"].append(item["caminho"])
            continue
        digest = hashlib.sha256()
        with open(item_path, "rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != item["sha256"]:
            failed += 1
            details["erros"].append(f"Hash divergente: {item['caminho']}")
        else:
            ok += 1

    check = IntegrityCheck(
        scope="backup",
        execution_id=execution.id,
        checked_count=checked,
        ok_count=ok,
        failed_count=failed,
        missing_count=missing,
        details=details,
        triggered_by_id=user.id if user else None,
    )
    db.add(check)
    execution.verified_at = _now()
    execution.verify_result = (
        f"{ok}/{checked} itens íntegros"
        + (f", {failed} com divergência" if failed else "")
        + (f", {missing} ausentes" if missing else "")
    )
    if failed or missing:
        execution.status = BackupStatus.CONCLUIDO_COM_ALERTA.value
    await db.flush()
    return check


# ── Restauração ──────────────────────────────────────────────────────────────


async def plan_restore(
    db: AsyncSession,
    *,
    execution: BackupExecution,
    scope: str,
    scope_id: Optional[uuid.UUID],
    conflict_strategy: str,
) -> dict:
    """Monta o plano antes de mexer em qualquer dado."""
    path = execution.destination
    if not path or not os.path.isdir(path):
        raise AppError(
            "O backup selecionado não está acessível neste servidor.", 422, "backup_indisponivel"
        )
    metadata_path = os.path.join(path, "metadata.json")
    if not os.path.exists(metadata_path):
        raise AppError("O backup não contém metadados restauráveis.", 422, "backup_incompleto")

    with open(metadata_path, "r", encoding="utf-8") as fh:
        metadata = json.load(fh)

    documents = metadata.get("documentos", [])
    if scope == "documento" and scope_id:
        documents = [d for d in documents if d["id"] == str(scope_id)]
    elif scope == "pasta" and scope_id:
        documents = [d for d in documents if d["folder_id"] == str(scope_id)]
    elif scope == "secretaria" and scope_id:
        documents = [d for d in documents if d.get("secretariat_id") == str(scope_id)]

    existing_ids = set()
    if documents:
        rows = (
            await db.scalars(
                select(Document.id).where(
                    Document.id.in_([uuid.UUID(d["id"]) for d in documents])
                )
            )
        ).all()
        existing_ids = {str(r) for r in rows}

    novos = [d for d in documents if d["id"] not in existing_ids]
    conflitos = [d for d in documents if d["id"] in existing_ids]
    return {
        "total": len(documents),
        "novos": len(novos),
        "conflitos": len(conflitos),
        "estrategia": conflict_strategy,
        "itens": [
            {
                "id": d["id"],
                "codigo": d.get("code"),
                "nome": d.get("display_name"),
                "situacao": "conflito" if d["id"] in existing_ids else "novo",
            }
            for d in documents[:200]
        ],
    }


async def run_restore(
    db: AsyncSession,
    *,
    execution: BackupExecution,
    job: RestoreJob,
    user: Optional[User] = None,
) -> RestoreJob:
    """Executa a restauração conforme o plano e a estratégia de conflito."""
    path = execution.destination
    job.status = RestoreStatus.EM_EXECUCAO.value
    job.started_at = _now()
    await db.flush()

    try:
        with open(os.path.join(path, "metadata.json"), "r", encoding="utf-8") as fh:
            metadata = json.load(fh)

        documents = metadata.get("documentos", [])
        versions = metadata.get("versoes", [])
        if job.scope == "documento" and job.scope_id:
            documents = [d for d in documents if d["id"] == str(job.scope_id)]
        elif job.scope == "pasta" and job.scope_id:
            documents = [d for d in documents if d["folder_id"] == str(job.scope_id)]
        elif job.scope == "secretaria" and job.scope_id:
            documents = [d for d in documents if d.get("secretariat_id") == str(job.scope_id)]

        wanted_ids = {d["id"] for d in documents}
        storage = get_storage()
        restored = 0

        for doc_data in documents:
            doc_id = uuid.UUID(doc_data["id"])
            existing = await db.get(Document, doc_id)
            if existing is not None and job.conflict_strategy == ConflictStrategy.IGNORAR.value:
                continue

            doc_versions = [v for v in versions if v["document_id"] == doc_data["id"]]
            for version_data in doc_versions:
                source = os.path.join(path, "files", version_data["id"], "conteudo.bin")
                if not os.path.exists(source):
                    continue
                with open(source, "rb") as fh:
                    data = fh.read()
                await storage.put(version_data["storage_key"], data)

            if existing is None:
                document = Document(**_deserialize_row(Document, doc_data))
                db.add(document)
                await db.flush()
                for version_data in doc_versions:
                    if await db.get(DocumentVersion, uuid.UUID(version_data["id"])):
                        continue
                    db.add(DocumentVersion(**_deserialize_row(DocumentVersion, version_data)))
                restored += 1
            else:
                if job.conflict_strategy == ConflictStrategy.SOBRESCREVER.value:
                    for key, value in _deserialize_row(Document, doc_data).items():
                        if key != "id":
                            setattr(existing, key, value)
                    existing.deleted_at = None
                    restored += 1
                elif job.conflict_strategy == ConflictStrategy.RENOMEAR.value:
                    clone = _deserialize_row(Document, doc_data)
                    clone["id"] = uuid.uuid4()
                    clone["code"] = f"{clone['code']}-R"
                    clone["display_name"] = f"{clone['display_name']} (restaurado)"[:300]
                    db.add(Document(**clone))
                    restored += 1
                elif job.conflict_strategy == ConflictStrategy.NOVA_VERSAO.value:
                    existing.deleted_at = None
                    restored += 1

            await db.flush()

        job.status = RestoreStatus.CONCLUIDO.value
        job.restored_count = restored
        job.message = f"{restored} documento(s) restaurado(s) de {len(wanted_ids)} previsto(s)."
    except Exception as exc:
        logger.exception("Falha na restauração")
        job.status = RestoreStatus.FALHOU.value
        job.message = str(exc)[:2000]
    finally:
        job.finished_at = _now()
        await db.flush()
    return job


def _deserialize_row(model, data: dict) -> dict:
    """Converte o JSON do backup de volta para tipos do SQLAlchemy."""
    from sqlalchemy import Boolean, Date, DateTime, Uuid

    result = {}
    for column in model.__table__.columns:
        if column.name not in data:
            continue
        value = data[column.name]
        if value is None:
            result[column.name] = None
            continue
        if isinstance(column.type, Uuid):
            result[column.name] = uuid.UUID(value) if isinstance(value, str) else value
        elif isinstance(column.type, DateTime):
            result[column.name] = (
                datetime.fromisoformat(value) if isinstance(value, str) else value
            )
        elif isinstance(column.type, Date):
            result[column.name] = (
                datetime.fromisoformat(value).date() if isinstance(value, str) else value
            )
        elif isinstance(column.type, Boolean):
            result[column.name] = bool(value)
        else:
            result[column.name] = value
    return result


# ── Retenção ─────────────────────────────────────────────────────────────────


async def apply_retention(db: AsyncSession, job: BackupJob) -> int:
    """Remove execuções antigas conforme a política diária/semanal/mensal."""
    executions = list(
        (
            await db.scalars(
                select(BackupExecution)
                .where(BackupExecution.job_id == job.id)
                .order_by(BackupExecution.started_at.desc())
            )
        ).all()
    )
    now = _now()
    keep: set = set()
    daily = [e for e in executions if e.started_at and e.started_at > now - timedelta(days=job.retention_daily)]
    keep.update(e.id for e in daily[: max(job.retention_daily, 1)])

    weekly_seen, monthly_seen = set(), set()
    for execution in executions:
        if not execution.started_at:
            continue
        week = execution.started_at.strftime("%Y-%W")
        month = execution.started_at.strftime("%Y-%m")
        if len(weekly_seen) < job.retention_weekly and week not in weekly_seen:
            weekly_seen.add(week)
            keep.add(execution.id)
        if len(monthly_seen) < job.retention_monthly and month not in monthly_seen:
            monthly_seen.add(month)
            keep.add(execution.id)

    removed = 0
    for execution in executions:
        if execution.id in keep:
            continue
        if execution.destination and os.path.isdir(execution.destination):
            shutil.rmtree(execution.destination, ignore_errors=True)
        await db.delete(execution)
        removed += 1
    await db.flush()
    return removed
