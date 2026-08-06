"""Regras de negócio de documentos: upload, versionamento, cópia e lixeira."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError, Conflict, NotFound
from app.core.storage import build_storage_key, get_storage
from app.core.timeutils import is_past
from app.models.document import Document, DocumentLock, DocumentVersion
from app.models.enums import (
    Classification,
    DocumentStatus,
    FileStatus,
    IndexStatus,
)
from app.models.folder import Folder
from app.models.organization import Institution
from app.models.user import User
from app.services import files as file_service
from app.services import storage_usage, text_extraction


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def generate_code(db: AsyncSession, institution_id: uuid.UUID) -> str:
    """Código único legível: DOC-2026-000123."""
    year = _now().year
    prefix = f"DOC-{year}-"
    count = await db.scalar(
        select(func.count(Document.id)).where(
            Document.institution_id == institution_id,
            Document.code.like(f"{prefix}%"),
        )
    )
    sequence = int(count or 0) + 1
    while True:
        code = f"{prefix}{sequence:06d}"
        exists = await db.scalar(select(Document.id).where(Document.code == code))
        if not exists:
            return code
        sequence += 1


async def find_duplicate(
    db: AsyncSession, institution_id: uuid.UUID, sha256: str
) -> Optional[Document]:
    return await db.scalar(
        select(Document)
        .where(
            Document.institution_id == institution_id,
            Document.sha256 == sha256,
            Document.deleted_at.is_(None),
        )
        .limit(1)
    )


async def _persist_bytes(
    document_id: uuid.UUID,
    version_id: uuid.UUID,
    institution_id: uuid.UUID,
    data: bytes,
) -> str:
    key = build_storage_key(institution_id, document_id, version_id, uuid.uuid4().hex)
    await get_storage().put(key, data)
    return key


def _scan(data: bytes) -> tuple:
    clean, detail = file_service.scan_bytes(data)
    status = FileStatus.AVAILABLE.value if clean else FileStatus.BLOCKED.value
    return clean, detail, status


async def create_document(
    db: AsyncSession,
    *,
    user: User,
    institution: Institution,
    folder: Folder,
    filename: str,
    data: bytes,
    metadata: Optional[dict] = None,
) -> tuple:
    """Cria documento + versão 1. Retorna (documento, versão, aviso)."""
    metadata = dict(metadata or {})

    validation = file_service.validate_upload(filename, data)
    if not validation.ok:
        raise AppError(validation.message, 422, "arquivo_invalido")

    await storage_usage.ensure_space(
        db,
        institution,
        validation.size,
        secretariat_id=folder.secretariat_id,
        department_id=folder.department_id,
    )

    clean, scan_detail, file_status = _scan(data)

    document_id = uuid.uuid4()
    version_id = uuid.uuid4()
    key = await _persist_bytes(document_id, version_id, institution.id, data)

    classification = metadata.pop("classification", None) or folder.classification
    display_name = (metadata.pop("display_name", None) or validation.safe_name).strip()

    document = Document(
        id=document_id,
        institution_id=institution.id,
        folder_id=folder.id,
        secretariat_id=folder.secretariat_id,
        department_id=folder.department_id,
        code=await generate_code(db, institution.id),
        display_name=display_name[:300],
        original_name=validation.safe_name,
        classification=classification,
        status=metadata.pop("status", DocumentStatus.APROVADO.value),
        owner_user_id=metadata.pop("owner_user_id", None) or user.id,
        current_version_id=version_id,
        current_version_number=1,
        size_bytes=validation.size,
        mime_type=validation.mime_type,
        extension=validation.extension,
        sha256=validation.sha256,
        file_status=file_status,
        index_status=IndexStatus.PENDENTE.value,
        created_by_id=user.id,
        updated_by_id=user.id,
        **metadata,
    )
    db.add(document)

    version = DocumentVersion(
        id=version_id,
        document_id=document_id,
        version_number=1,
        storage_key=key,
        storage_bucket=settings.S3_BUCKET if settings.STORAGE_BACKEND == "s3" else None,
        original_name=validation.safe_name,
        extension=validation.extension,
        mime_type=validation.mime_type,
        size_bytes=validation.size,
        sha256=validation.sha256,
        change_note="Versão inicial",
        file_status=file_status,
        scan_result=scan_detail[:300],
        is_current=True,
        uploaded_by_id=user.id,
    )
    db.add(version)
    await db.flush()

    aviso = None if clean else (
        f"O arquivo foi bloqueado pela verificação de segurança: {scan_detail}"
    )
    return document, version, aviso


async def add_version(
    db: AsyncSession,
    *,
    user: User,
    institution: Institution,
    document: Document,
    filename: str,
    data: bytes,
    change_note: Optional[str] = None,
) -> tuple:
    validation = file_service.validate_upload(filename, data)
    if not validation.ok:
        raise AppError(validation.message, 422, "arquivo_invalido")

    await ensure_not_locked(db, document, user)
    await storage_usage.ensure_space(
        db,
        institution,
        validation.size,
        secretariat_id=document.secretariat_id,
        department_id=document.department_id,
    )

    clean, scan_detail, file_status = _scan(data)

    next_number = int(
        await db.scalar(
            select(func.coalesce(func.max(DocumentVersion.version_number), 0)).where(
                DocumentVersion.document_id == document.id
            )
        )
        or 0
    ) + 1

    version_id = uuid.uuid4()
    key = await _persist_bytes(document.id, version_id, institution.id, data)

    await db.execute(
        DocumentVersion.__table__.update()
        .where(DocumentVersion.document_id == document.id)
        .values(is_current=False)
    )

    version = DocumentVersion(
        id=version_id,
        document_id=document.id,
        version_number=next_number,
        storage_key=key,
        storage_bucket=settings.S3_BUCKET if settings.STORAGE_BACKEND == "s3" else None,
        original_name=validation.safe_name,
        extension=validation.extension,
        mime_type=validation.mime_type,
        size_bytes=validation.size,
        sha256=validation.sha256,
        change_note=change_note or f"Versão {next_number}",
        file_status=file_status,
        scan_result=scan_detail[:300],
        is_current=True,
        uploaded_by_id=user.id,
    )
    db.add(version)

    document.current_version_id = version_id
    document.current_version_number = next_number
    document.size_bytes = validation.size
    document.mime_type = validation.mime_type
    document.extension = validation.extension
    document.sha256 = validation.sha256
    document.file_status = file_status
    document.index_status = IndexStatus.PENDENTE.value
    document.updated_by_id = user.id
    document.row_version += 1
    # Documento aprovado que recebe nova versão volta a precisar de aprovação.
    if document.status == DocumentStatus.APROVADO.value:
        document.status = DocumentStatus.AGUARDANDO_APROVACAO.value

    await db.flush()
    aviso = None if clean else (
        f"A nova versão foi bloqueada pela verificação de segurança: {scan_detail}"
    )
    return document, version, aviso


async def restore_version(
    db: AsyncSession, *, user: User, document: Document, version_number: int
) -> DocumentVersion:
    """Restaurar não apaga nada: gera uma NOVA versão a partir da escolhida."""
    source = await db.scalar(
        select(DocumentVersion).where(
            DocumentVersion.document_id == document.id,
            DocumentVersion.version_number == version_number,
        )
    )
    if source is None:
        raise NotFound("Versão não encontrada.")

    await ensure_not_locked(db, document, user)

    next_number = document.current_version_number + 1
    version_id = uuid.uuid4()
    new_key = build_storage_key(
        document.institution_id, document.id, version_id, uuid.uuid4().hex
    )
    await get_storage().copy(source.storage_key, new_key)

    await db.execute(
        DocumentVersion.__table__.update()
        .where(DocumentVersion.document_id == document.id)
        .values(is_current=False)
    )

    version = DocumentVersion(
        id=version_id,
        document_id=document.id,
        version_number=next_number,
        storage_key=new_key,
        storage_bucket=source.storage_bucket,
        original_name=source.original_name,
        extension=source.extension,
        mime_type=source.mime_type,
        size_bytes=source.size_bytes,
        sha256=source.sha256,
        change_note=f"Restaurada a partir da versão {version_number}",
        file_status=source.file_status,
        scan_result=source.scan_result,
        is_current=True,
        restored_from_version=version_number,
        uploaded_by_id=user.id,
    )
    db.add(version)

    document.current_version_id = version_id
    document.current_version_number = next_number
    document.size_bytes = source.size_bytes
    document.mime_type = source.mime_type
    document.extension = source.extension
    document.sha256 = source.sha256
    document.file_status = source.file_status
    document.updated_by_id = user.id
    document.row_version += 1
    await db.flush()
    return version


async def copy_document(
    db: AsyncSession, *, user: User, document: Document, target_folder: Folder
) -> Document:
    current = await db.scalar(
        select(DocumentVersion).where(DocumentVersion.id == document.current_version_id)
    )
    if current is None:
        raise NotFound("Versão atual do documento não encontrada.")

    new_id = uuid.uuid4()
    version_id = uuid.uuid4()
    new_key = build_storage_key(
        document.institution_id, new_id, version_id, uuid.uuid4().hex
    )
    await get_storage().copy(current.storage_key, new_key)

    copy = Document(
        id=new_id,
        institution_id=document.institution_id,
        folder_id=target_folder.id,
        secretariat_id=target_folder.secretariat_id,
        department_id=target_folder.department_id,
        category_id=document.category_id,
        code=await generate_code(db, document.institution_id),
        display_name=f"{document.display_name} (cópia)"[:300],
        original_name=document.original_name,
        description=document.description,
        subject=document.subject,
        classification=document.classification,
        status=DocumentStatus.RASCUNHO.value,
        owner_user_id=user.id,
        current_version_id=version_id,
        current_version_number=1,
        size_bytes=current.size_bytes,
        mime_type=current.mime_type,
        extension=current.extension,
        sha256=current.sha256,
        file_status=document.file_status,
        index_status=IndexStatus.PENDENTE.value,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(copy)
    db.add(
        DocumentVersion(
            id=version_id,
            document_id=new_id,
            version_number=1,
            storage_key=new_key,
            storage_bucket=current.storage_bucket,
            original_name=current.original_name,
            extension=current.extension,
            mime_type=current.mime_type,
            size_bytes=current.size_bytes,
            sha256=current.sha256,
            change_note=f"Cópia de {document.code}",
            file_status=current.file_status,
            is_current=True,
            uploaded_by_id=user.id,
        )
    )
    await db.flush()
    return copy


async def create_shortcut(
    db: AsyncSession, *, user: User, document: Document, target_folder: Folder
) -> Document:
    """Atalho: aponta para o documento original, sem duplicar o arquivo."""
    shortcut = Document(
        institution_id=document.institution_id,
        folder_id=target_folder.id,
        secretariat_id=target_folder.secretariat_id,
        department_id=target_folder.department_id,
        code=await generate_code(db, document.institution_id),
        display_name=f"{document.display_name} (atalho)"[:300],
        original_name=document.original_name,
        classification=document.classification,
        status=document.status,
        owner_user_id=user.id,
        is_shortcut=True,
        shortcut_target_id=document.id,
        size_bytes=0,
        mime_type=document.mime_type,
        extension=document.extension,
        file_status=FileStatus.AVAILABLE.value,
        index_status=IndexStatus.NAO_SUPORTADO.value,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(shortcut)
    await db.flush()
    return shortcut


async def move_document(
    db: AsyncSession, *, user: User, document: Document, target_folder: Folder
) -> Document:
    if target_folder.institution_id != document.institution_id:
        raise NotFound("Pasta de destino não encontrada.")
    document.folder_id = target_folder.id
    document.secretariat_id = target_folder.secretariat_id
    document.department_id = target_folder.department_id
    document.updated_by_id = user.id
    document.row_version += 1
    await db.flush()
    return document


async def soft_delete(
    db: AsyncSession, *, user: User, document: Document, reason: Optional[str] = None
) -> Document:
    if document.legal_hold:
        raise Conflict(
            "Este documento está sob bloqueio legal e não pode ser excluído.",
            "bloqueio_legal",
        )
    document.deleted_at = _now()
    document.deleted_by_id = user.id
    document.delete_reason = reason
    await db.flush()
    return document


async def restore_document(
    db: AsyncSession, *, user: User, document: Document, target_folder_id: Optional[uuid.UUID]
) -> Document:
    folder_id = target_folder_id or document.folder_id
    folder = await db.get(Folder, folder_id)
    if folder is None or folder.deleted_at is not None:
        raise AppError(
            "A pasta original não está disponível. Escolha outro destino para a restauração.",
            409,
            "destino_indisponivel",
        )
    document.folder_id = folder.id
    document.secretariat_id = folder.secretariat_id
    document.department_id = folder.department_id
    document.deleted_at = None
    document.deleted_by_id = None
    document.delete_reason = None
    document.updated_by_id = user.id
    await db.flush()
    return document


async def purge_document(db: AsyncSession, *, document: Document) -> int:
    """Exclusão definitiva: remove os arquivos físicos e o registro."""
    versions = (
        await db.scalars(
            select(DocumentVersion).where(DocumentVersion.document_id == document.id)
        )
    ).all()
    storage = get_storage()
    removed = 0
    for version in versions:
        try:
            await storage.delete(version.storage_key)
            removed += 1
        except Exception:  # pragma: no cover - arquivo já ausente
            pass
    await db.delete(document)
    await db.flush()
    return removed


async def index_document(db: AsyncSession, document: Document) -> None:
    """Extrai o texto da versão atual (executado em segundo plano)."""
    document.index_status = IndexStatus.PROCESSANDO.value
    await db.flush()
    version = await db.get(DocumentVersion, document.current_version_id)
    if version is None:
        document.index_status = IndexStatus.FALHOU.value
        await db.flush()
        return
    try:
        data = await get_storage().get(version.storage_key)
    except Exception:
        document.index_status = IndexStatus.FALHOU.value
        await db.flush()
        return
    text, status = text_extraction.extract_text(data, version.extension or "", version.mime_type)
    document.extracted_text = text or None
    document.index_status = status
    await db.flush()


async def ensure_not_locked(db: AsyncSession, document: Document, user: User) -> None:
    lock = await db.scalar(
        select(DocumentLock).where(DocumentLock.document_id == document.id)
    )
    if lock is None:
        return
    if is_past(lock.expires_at):
        await db.delete(lock)
        await db.flush()
        return
    if lock.user_id == user.id:
        return
    holder = await db.get(User, lock.user_id)
    nome = holder.name if holder else "outro usuário"
    raise Conflict(
        f"Este documento está sendo editado por {nome} desde "
        f"{lock.created_at.strftime('%d/%m/%Y %H:%M')}. Solicite a liberação.",
        "documento_bloqueado",
    )


async def acquire_lock(
    db: AsyncSession, *, document: Document, user: User, reason: Optional[str] = None
) -> DocumentLock:
    await ensure_not_locked(db, document, user)
    lock = await db.scalar(
        select(DocumentLock).where(DocumentLock.document_id == document.id)
    )
    expires = _now() + timedelta(minutes=settings.DOCUMENT_LOCK_MINUTES)
    if lock:
        lock.expires_at = expires
        lock.reason = reason
    else:
        lock = DocumentLock(
            document_id=document.id, user_id=user.id, expires_at=expires, reason=reason
        )
        db.add(lock)
    await db.flush()
    return lock


def check_row_version(document: Document, expected: Optional[int]) -> None:
    """Controle otimista: recusa gravação sobre dado desatualizado."""
    if expected is not None and expected != document.row_version:
        raise Conflict(
            "Este documento foi alterado por outro usuário. "
            "Recarregue as informações antes de salvar novamente.",
            "conflito_versao",
        )


def requires_justification(document: Document) -> bool:
    return document.classification in {
        Classification.CONFIDENCIAL.value,
        Classification.SIGILOSO.value,
    }
