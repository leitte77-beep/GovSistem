"""Documentos: envio, consulta, versões, download, comentários e bloqueio."""

import json
import uuid
from datetime import date, datetime
from typing import List, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    Query,
    Request,
    UploadFile,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    Pagination,
    client_info,
    department_names,
    get_institution,
    page_payload,
    secretariat_names,
    user_names,
)
from app.core.auth import get_current_user
from app.core.config import settings
from app.core.database import async_session, get_db
from app.core.errors import AppError, NotFound
from app.core.storage import get_storage, iter_file
from app.models.document import (
    Document,
    DocumentCustomField,
    DocumentLock,
    DocumentVersion,
    Favorite,
)
from app.models.enums import (
    AuditAction,
    AuditResult,
    Classification,
    FileStatus,
    Permission,
    ResourceType,
)
from app.models.folder import Folder
from app.models.governance import AuditLog, Comment, CommentMention
from app.models.organization import Institution
from app.models.taxonomy import Category, CategoryField, DocumentTag, Tag
from app.models.user import User
from app.schemas.common import Message
from app.schemas.content import (
    CommentCreate,
    CommentOut,
    DeleteRequest,
    DocumentOut,
    DocumentUpdate,
    LockRequest,
    MoveRequest,
    VersionOut,
    VersionRestoreRequest,
)
from app.services import audit, notifications
from app.services import documents as doc_service
from app.services import permissions as perm
from app.services import search as search_service

router = APIRouter(prefix="/documentos", tags=["Documentos"])

PREVIEWABLE = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/svg+xml",
    "text/plain",
    "text/csv",
    "text/markdown",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "video/mp4",
    "video/webm",
}


async def _index_later(document_id: uuid.UUID) -> None:
    """Extração de texto em segundo plano — o upload não espera por ela."""
    async with async_session() as db:
        document = await db.get(Document, document_id)
        if document is None:
            return
        await doc_service.index_document(db, document)
        await db.commit()


async def _tags_for(db: AsyncSession, document_id: uuid.UUID) -> List[str]:
    rows = (
        await db.execute(
            select(Tag.name)
            .join(DocumentTag, DocumentTag.tag_id == Tag.id)
            .where(DocumentTag.document_id == document_id)
        )
    ).all()
    return [row[0] for row in rows]


async def _custom_fields(db: AsyncSession, document_id: uuid.UUID) -> dict:
    rows = (
        await db.execute(
            select(CategoryField.key, DocumentCustomField.value)
            .join(
                DocumentCustomField,
                DocumentCustomField.field_id == CategoryField.id,
            )
            .where(DocumentCustomField.document_id == document_id)
        )
    ).all()
    return {row[0]: row[1] for row in rows}


async def _sync_tags(db: AsyncSession, document: Document, etiquetas: List[str]) -> None:
    import re
    import unicodedata

    atuais = (
        await db.scalars(select(DocumentTag).where(DocumentTag.document_id == document.id))
    ).all()
    for item in atuais:
        await db.delete(item)
    for nome in etiquetas or []:
        normalized = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
        slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")[:80]
        if not slug:
            continue
        tag = await db.scalar(
            select(Tag).where(
                Tag.institution_id == document.institution_id, Tag.slug == slug
            )
        )
        if tag is None:
            tag = Tag(institution_id=document.institution_id, name=nome.strip(), slug=slug)
            db.add(tag)
            await db.flush()
        db.add(DocumentTag(document_id=document.id, tag_id=tag.id))


async def _sync_custom_fields(
    db: AsyncSession, document: Document, valores: dict
) -> None:
    if document.category_id is None:
        return
    campos = (
        await db.scalars(
            select(CategoryField).where(CategoryField.category_id == document.category_id)
        )
    ).all()
    by_key = {campo.key: campo for campo in campos}

    faltando = [
        campo.label
        for campo in campos
        if campo.required and not (valores or {}).get(campo.key)
    ]
    if faltando:
        raise AppError(
            "Preencha os campos obrigatórios da categoria: " + ", ".join(faltando),
            422,
            "campos_obrigatorios",
        )

    for chave, valor in (valores or {}).items():
        campo = by_key.get(chave)
        if campo is None:
            continue
        existing = await db.scalar(
            select(DocumentCustomField).where(
                DocumentCustomField.document_id == document.id,
                DocumentCustomField.field_id == campo.id,
            )
        )
        if existing:
            existing.value = valor
        else:
            db.add(
                DocumentCustomField(
                    document_id=document.id, field_id=campo.id, value=valor
                )
            )


async def _decorate_many(
    db: AsyncSession, user: User, documents: List[Document]
) -> List[DocumentOut]:
    if not documents:
        return []
    folder_rows = (
        await db.execute(
            select(Folder.id, Folder.name).where(
                Folder.id.in_({d.folder_id for d in documents})
            )
        )
    ).all()
    folder_names = {row[0]: row[1] for row in folder_rows}
    category_rows = (
        await db.execute(
            select(Category.id, Category.name).where(
                Category.id.in_({d.category_id for d in documents if d.category_id})
            )
        )
    ).all()
    category_names = {row[0]: row[1] for row in category_rows}
    owner_names = await user_names(db, [d.owner_user_id for d in documents])
    sec_names = await secretariat_names(db, [d.secretariat_id for d in documents])
    dep_names = await department_names(db, [d.department_id for d in documents])
    favorites = set(
        (
            await db.scalars(
                select(Favorite.resource_id).where(
                    Favorite.user_id == user.id,
                    Favorite.resource_type == ResourceType.DOCUMENT.value,
                )
            )
        ).all()
    )

    result = []
    for doc in documents:
        ctx = await perm.build_document_context(db, doc)
        perms = await perm.effective_permissions(db, user, ctx)
        result.append(
            DocumentOut.build(
                doc,
                pasta_nome=folder_names.get(doc.folder_id),
                categoria_nome=category_names.get(doc.category_id),
                responsavel_nome=owner_names.get(doc.owner_user_id),
                secretaria_nome=sec_names.get(doc.secretariat_id),
                setor_nome=dep_names.get(doc.department_id),
                favorito=doc.id in favorites,
                permissoes=sorted(perms),
            )
        )
    return result


def _parse_metadata(raw: Optional[str]) -> dict:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise AppError(
            "Os metadados enviados não estão em formato válido.", 422, "metadados_invalidos"
        )
    if not isinstance(data, dict):
        raise AppError("Os metadados devem ser um objeto.", 422, "metadados_invalidos")
    return data


def _apply_metadata(document: Document, data: dict) -> None:
    mapping = {
        "nome_exibicao": "display_name",
        "descricao": "description",
        "assunto": "subject",
        "numero_processo": "process_number",
        "numero_protocolo": "protocol_number",
        "numero_contrato": "contract_number",
        "ano_referencia": "reference_year",
        "autor": "author_name",
        "interessado": "stakeholder_name",
        "observacoes": "notes",
    }
    for field, value in data.items():
        if field in mapping and value is not None:
            setattr(document, mapping[field], value)
    if data.get("data_documento"):
        document.document_date = _as_date(data["data_documento"])
    if data.get("data_validade"):
        document.expires_on = _as_date(data["data_validade"])
    if data.get("categoria_id"):
        document.category_id = uuid.UUID(str(data["categoria_id"]))
    if data.get("responsavel_id"):
        document.owner_user_id = uuid.UUID(str(data["responsavel_id"]))
    if data.get("classificacao"):
        document.classification = Classification(data["classificacao"]).value
    if data.get("situacao"):
        document.status = data["situacao"]
    if data.get("politica_retencao_id"):
        document.retention_policy_id = uuid.UUID(str(data["politica_retencao_id"]))


def _as_date(value) -> Optional[date]:
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value:
        return datetime.fromisoformat(value).date()
    return None


# ── Envio ────────────────────────────────────────────────────────────────────


@router.post("/upload", status_code=201, summary="Enviar documento")
async def upload_document(
    request: Request,
    background: BackgroundTasks,
    pasta_id: uuid.UUID = Form(...),
    arquivo: UploadFile = File(...),
    metadados: Optional[str] = Form(None),
    acao_duplicidade: Optional[str] = Form(None),
    documento_existente_id: Optional[uuid.UUID] = Form(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    folder = await perm.get_folder_or_404(db, pasta_id)
    await perm.require_folder_permission(db, user, folder, Permission.UPLOAD)

    data = await arquivo.read()
    if len(data) > settings.MAX_FILE_SIZE_BYTES:
        raise AppError(
            "Não foi possível enviar o arquivo porque ele excede o tamanho máximo de "
            f"{settings.MAX_FILE_SIZE_MB} MB.",
            413,
            "arquivo_grande",
        )

    metadata = _parse_metadata(metadados)
    etiquetas = metadata.pop("etiquetas", None)
    campos = metadata.pop("campos_personalizados", None)

    from app.services.files import validate_upload

    check = validate_upload(arquivo.filename or "arquivo", data)
    if not check.ok:
        await audit.record(
            db,
            action=AuditAction.DOCUMENT_UPLOAD,
            user=user,
            resource_type="folder",
            resource_id=folder.id,
            resource_name=arquivo.filename,
            result=AuditResult.NEGADO,
            detail=check.message,
            client=client_info(request),
        )
        await db.commit()
        raise AppError(check.message, 422, "arquivo_invalido")

    # Duplicidade: só informa o que o usuário tem direito de ver.
    duplicado = await doc_service.find_duplicate(db, institution.id, check.sha256)
    if duplicado is not None and acao_duplicidade in (None, ""):
        pode_ver = await perm.can_document(db, user, duplicado, Permission.VIEW)
        pasta_dup = await db.get(Folder, duplicado.folder_id)
        info = {
            "mensagem": "Foi localizado um arquivo idêntico no sistema.",
            "acesso_permitido": pode_ver,
            "documento_id": str(duplicado.id) if pode_ver else None,
            "codigo": duplicado.code if pode_ver else None,
            "nome": duplicado.display_name if pode_ver else None,
            "pasta": pasta_dup.name if (pode_ver and pasta_dup) else None,
            "secretaria_id": str(duplicado.secretariat_id or "") if pode_ver else None,
            "responsavel_id": str(duplicado.owner_user_id or "") if pode_ver else None,
            "data": duplicado.created_at.isoformat() if pode_ver else None,
            "opcoes": [
                "cancelar",
                "nova_versao",
                "novo_documento",
                "atalho",
                "solicitar_acesso",
            ],
        }
        return {"duplicado": info, "documento": None, "versao": None}

    if acao_duplicidade == "cancelar":
        return {"mensagem": "Envio cancelado pelo usuário.", "documento": None}

    if acao_duplicidade == "nova_versao" and (documento_existente_id or duplicado):
        alvo = await perm.get_document_or_404(
            db, documento_existente_id or duplicado.id
        )
        await perm.require_document_permission(db, user, alvo, Permission.NEW_VERSION)
        document, version, aviso = await doc_service.add_version(
            db,
            user=user,
            institution=institution,
            document=alvo,
            filename=arquivo.filename or "arquivo",
            data=data,
            change_note=metadata.get("descricao") or "Nova versão enviada",
        )
    elif acao_duplicidade == "atalho" and (documento_existente_id or duplicado):
        alvo = await perm.get_document_or_404(
            db, documento_existente_id or duplicado.id
        )
        await perm.require_document_permission(db, user, alvo, Permission.VIEW)
        document = await doc_service.create_shortcut(
            db, user=user, document=alvo, target_folder=folder
        )
        await audit.record(
            db,
            action=AuditAction.DOCUMENT_UPLOAD,
            user=user,
            resource_type="document",
            resource_id=document.id,
            resource_name=document.display_name,
            detail="Atalho criado para documento existente",
            client=client_info(request),
        )
        await db.commit()
        return {
            "documento": (await _decorate_many(db, user, [document]))[0],
            "versao": None,
            "mensagem": "Atalho criado para o documento existente.",
        }
    else:
        document, version, aviso = await doc_service.create_document(
            db,
            user=user,
            institution=institution,
            folder=folder,
            filename=arquivo.filename or "arquivo",
            data=data,
            metadata={},
        )
        _apply_metadata(document, metadata)

    if etiquetas is not None:
        await _sync_tags(db, document, etiquetas)
    if campos:
        await _sync_custom_fields(db, document, campos)

    await audit.record(
        db,
        action=AuditAction.DOCUMENT_UPLOAD,
        user=user,
        resource_type="document",
        resource_id=document.id,
        resource_name=document.display_name,
        secretariat_id=document.secretariat_id,
        department_id=document.department_id,
        detail=f"Versão {version.version_number} — {check.size} bytes",
        data_after={"codigo": document.code, "sha256": document.sha256},
        client=client_info(request),
    )
    if document.file_status == FileStatus.BLOCKED.value:
        await notifications.notify(
            db,
            user_id=user.id,
            type_=__import__(
                "app.models.enums", fromlist=["NotificationType"]
            ).NotificationType.ARQUIVO_BLOQUEADO,
            title="Arquivo bloqueado pela verificação de segurança",
            body=aviso,
            resource_type="document",
            resource_id=document.id,
        )
    await db.commit()
    await db.refresh(document)

    if document.file_status == FileStatus.AVAILABLE.value:
        background.add_task(_index_later, document.id)

    return {
        "documento": (await _decorate_many(db, user, [document]))[0],
        "versao": VersionOut.build(version, autor_nome=user.name),
        "aviso": aviso,
    }


# ── Consulta ─────────────────────────────────────────────────────────────────


@router.get("", summary="Listar e pesquisar documentos")
async def list_documents(
    termo: Optional[str] = Query(None),
    pasta_id: Optional[uuid.UUID] = Query(None),
    incluir_subpastas: bool = Query(False),
    secretaria_id: Optional[uuid.UUID] = Query(None),
    setor_id: Optional[uuid.UUID] = Query(None),
    categoria_id: Optional[uuid.UUID] = Query(None),
    responsavel_id: Optional[uuid.UUID] = Query(None),
    classificacao: Optional[str] = Query(None),
    situacao: Optional[str] = Query(None),
    extensao: Optional[str] = Query(None),
    etiqueta: Optional[str] = Query(None),
    ano: Optional[int] = Query(None),
    criado_de: Optional[date] = Query(None),
    criado_ate: Optional[date] = Query(None),
    documento_de: Optional[date] = Query(None),
    documento_ate: Optional[date] = Query(None),
    vence_em_dias: Optional[int] = Query(None),
    vencidos: Optional[bool] = Query(None),
    sem_categoria: Optional[bool] = Query(None),
    com_link_externo: Optional[bool] = Query(None),
    duplicados: Optional[bool] = Query(None),
    favoritos: Optional[bool] = Query(None),
    recentes: Optional[bool] = Query(None),
    ordenar: str = Query("alteracao"),
    direcao: str = Query("desc"),
    paginacao: Pagination = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = await search_service.build_query(
        db,
        user,
        term=termo,
        folder_id=pasta_id,
        include_subfolders=incluir_subpastas,
        secretariat_id=secretaria_id,
        department_id=setor_id,
        category_id=categoria_id,
        owner_id=responsavel_id,
        classification=classificacao,
        status=situacao,
        extension=extensao,
        tag=etiqueta,
        reference_year=ano,
        created_from=criado_de,
        created_to=criado_ate,
        document_from=documento_de,
        document_to=documento_ate,
        expiring_in_days=vence_em_dias,
        expired=vencidos,
        without_category=sem_categoria,
        with_external_link=com_link_externo,
        duplicates=duplicados,
    )
    if favoritos:
        stmt = stmt.where(
            Document.id.in_(
                select(Favorite.resource_id).where(
                    Favorite.user_id == user.id,
                    Favorite.resource_type == ResourceType.DOCUMENT.value,
                )
            )
        )
    if recentes:
        ordenar, direcao = "alteracao", "desc"

    total = await search_service.count_query(db, stmt)
    stmt = search_service.apply_sort(stmt, ordenar, direcao)
    rows = list(
        (await db.scalars(stmt.offset(paginacao.offset).limit(paginacao.por_pagina))).all()
    )
    return page_payload(await _decorate_many(db, user, rows), total, paginacao)


@router.get("/{document_id}", response_model=DocumentOut, summary="Detalhar documento")
async def get_document(
    document_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await perm.get_document_or_404(db, document_id)
    await perm.require_document_permission(db, user, document, Permission.VIEW)

    document.view_count += 1
    document.last_accessed_at = datetime.now(document.created_at.tzinfo)
    if doc_service.requires_justification(document):
        await audit.record(
            db,
            action=AuditAction.DOCUMENT_VIEW,
            user=user,
            resource_type="document",
            resource_id=document.id,
            resource_name=document.display_name,
            detail=f"Documento {document.classification}",
            client=client_info(request),
        )
    await db.commit()

    detail = (await _decorate_many(db, user, [document]))[0]
    detail.etiquetas = await _tags_for(db, document.id)
    detail.campos_personalizados = await _custom_fields(db, document.id)
    return detail


@router.put("/{document_id}", response_model=DocumentOut, summary="Editar informações")
async def update_document(
    document_id: uuid.UUID,
    payload: DocumentUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await perm.get_document_or_404(db, document_id)
    await perm.require_document_permission(db, user, document, Permission.EDIT_METADATA)
    doc_service.check_row_version(document, payload.versao_controle)
    await doc_service.ensure_not_locked(db, document, user)

    before = {
        "nome_exibicao": document.display_name,
        "classificacao": document.classification,
        "situacao": document.status,
    }
    data = payload.model_dump(exclude_unset=True, exclude_none=True)
    etiquetas = data.pop("etiquetas", None)
    campos = data.pop("campos_personalizados", None)
    data.pop("versao_controle", None)
    if "bloqueio_legal" in data:
        document.legal_hold = bool(data.pop("bloqueio_legal"))
    if "herdar_permissoes" in data:
        document.inherit_permissions = bool(data.pop("herdar_permissoes"))
    if "classificacao" in data and data["classificacao"]:
        data["classificacao"] = (
            data["classificacao"].value
            if hasattr(data["classificacao"], "value")
            else data["classificacao"]
        )
    if "situacao" in data and data["situacao"]:
        data["situacao"] = (
            data["situacao"].value
            if hasattr(data["situacao"], "value")
            else data["situacao"]
        )
    _apply_metadata(document, data)

    if etiquetas is not None:
        await _sync_tags(db, document, etiquetas)
    if campos is not None:
        await _sync_custom_fields(db, document, campos)

    document.updated_by_id = user.id
    document.row_version += 1
    await audit.record(
        db,
        action=AuditAction.DOCUMENT_UPDATE,
        user=user,
        resource_type="document",
        resource_id=document.id,
        resource_name=document.display_name,
        data_before=before,
        data_after={
            "nome_exibicao": document.display_name,
            "classificacao": document.classification,
            "situacao": document.status,
        },
        client=client_info(request),
    )
    await db.commit()
    await db.refresh(document)
    detail = (await _decorate_many(db, user, [document]))[0]
    detail.etiquetas = await _tags_for(db, document.id)
    detail.campos_personalizados = await _custom_fields(db, document.id)
    return detail


# ── Download e visualização ──────────────────────────────────────────────────


async def _stream_version(
    db: AsyncSession,
    request: Request,
    user: User,
    document: Document,
    version: DocumentVersion,
    *,
    inline: bool,
) -> StreamingResponse:
    if version.file_status == FileStatus.BLOCKED.value and not user.is_admin:
        raise AppError(
            "Este arquivo foi bloqueado pela verificação de segurança e não pode ser baixado.",
            403,
            "arquivo_bloqueado",
        )

    disposition = "inline" if inline else "attachment"
    nome = version.original_name.replace('"', "")
    action = AuditAction.DOCUMENT_VIEW if inline else AuditAction.DOCUMENT_DOWNLOAD
    if not inline:
        document.download_count += 1
    await audit.record(
        db,
        action=action,
        user=user,
        resource_type="document",
        resource_id=document.id,
        resource_name=document.display_name,
        secretariat_id=document.secretariat_id,
        department_id=document.department_id,
        detail=f"Versão {version.version_number}",
        client=client_info(request),
    )
    await db.commit()

    return StreamingResponse(
        iter_file(version.storage_key),
        media_type=version.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'{disposition}; filename="{nome}"',
            "Content-Length": str(version.size_bytes),
            "Cache-Control": "private, no-store",
        },
    )


@router.get("/{document_id}/download", summary="Baixar documento")
async def download_document(
    document_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await perm.get_document_or_404(db, document_id)
    if document.is_shortcut and document.shortcut_target_id:
        document = await perm.get_document_or_404(db, document.shortcut_target_id)
    await perm.require_document_permission(db, user, document, Permission.DOWNLOAD)
    version = await db.get(DocumentVersion, document.current_version_id)
    if version is None:
        raise NotFound("Arquivo não encontrado para este documento.")
    return await _stream_version(db, request, user, document, version, inline=False)


@router.get("/{document_id}/visualizar", summary="Visualizar documento no navegador")
async def preview_document(
    document_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await perm.get_document_or_404(db, document_id)
    if document.is_shortcut and document.shortcut_target_id:
        document = await perm.get_document_or_404(db, document.shortcut_target_id)
    await perm.require_document_permission(db, user, document, Permission.VIEW)
    version = await db.get(DocumentVersion, document.current_version_id)
    if version is None:
        raise NotFound("Arquivo não encontrado para este documento.")
    if (version.mime_type or "") not in PREVIEWABLE:
        raise AppError(
            "Este formato não possui visualização no navegador. Faça o download para abrir.",
            415,
            "formato_sem_previa",
        )
    return await _stream_version(db, request, user, document, version, inline=True)


@router.get("/{document_id}/link-temporario", summary="Gerar URL assinada temporária")
async def signed_url(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await perm.get_document_or_404(db, document_id)
    await perm.require_document_permission(db, user, document, Permission.DOWNLOAD)
    version = await db.get(DocumentVersion, document.current_version_id)
    if version is None:
        raise NotFound("Arquivo não encontrado.")
    url = await get_storage().presigned_url(version.storage_key, version.original_name)
    if not url:
        return {
            "url": None,
            "mensagem": (
                "O armazenamento local não emite URL assinada. "
                "Use o endpoint de download autenticado."
            ),
        }
    return {"url": url, "expira_em_segundos": settings.S3_SIGNED_URL_TTL_SECONDS}


# ── Versões ──────────────────────────────────────────────────────────────────


@router.get(
    "/{document_id}/versoes", response_model=List[VersionOut], summary="Listar versões"
)
async def list_versions(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await perm.get_document_or_404(db, document_id)
    await perm.require_document_permission(db, user, document, Permission.VIEW_VERSIONS)
    versions = list(
        (
            await db.scalars(
                select(DocumentVersion)
                .where(DocumentVersion.document_id == document.id)
                .order_by(DocumentVersion.version_number.desc())
            )
        ).all()
    )
    names = await user_names(db, [v.uploaded_by_id for v in versions])
    return [VersionOut.build(v, autor_nome=names.get(v.uploaded_by_id)) for v in versions]


@router.post("/{document_id}/versoes", status_code=201, summary="Enviar nova versão")
async def upload_version(
    document_id: uuid.UUID,
    request: Request,
    background: BackgroundTasks,
    arquivo: UploadFile = File(...),
    descricao: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    document = await perm.get_document_or_404(db, document_id)
    await perm.require_document_permission(db, user, document, Permission.NEW_VERSION)

    data = await arquivo.read()
    document, version, aviso = await doc_service.add_version(
        db,
        user=user,
        institution=institution,
        document=document,
        filename=arquivo.filename or "arquivo",
        data=data,
        change_note=descricao,
    )
    await audit.record(
        db,
        action=AuditAction.VERSION_CREATE,
        user=user,
        resource_type="document",
        resource_id=document.id,
        resource_name=document.display_name,
        detail=f"Versão {version.version_number}",
        client=client_info(request),
    )
    if document.owner_user_id and document.owner_user_id != user.id:
        from app.models.enums import NotificationType

        await notifications.notify(
            db,
            user_id=document.owner_user_id,
            type_=NotificationType.NOVA_VERSAO,
            title=f"Nova versão de {document.display_name}",
            body=f"{user.name} enviou a versão {version.version_number}.",
            resource_type="document",
            resource_id=document.id,
        )
    await db.commit()
    if document.file_status == FileStatus.AVAILABLE.value:
        background.add_task(_index_later, document.id)
    return {
        "documento": (await _decorate_many(db, user, [document]))[0],
        "versao": VersionOut.build(version, autor_nome=user.name),
        "aviso": aviso,
    }


@router.get("/{document_id}/versoes/{numero}/download", summary="Baixar versão anterior")
async def download_version(
    document_id: uuid.UUID,
    numero: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await perm.get_document_or_404(db, document_id)
    await perm.require_document_permission(db, user, document, Permission.DOWNLOAD)
    version = await db.scalar(
        select(DocumentVersion).where(
            DocumentVersion.document_id == document.id,
            DocumentVersion.version_number == numero,
        )
    )
    if version is None:
        raise NotFound("Versão não encontrada.")
    return await _stream_version(db, request, user, document, version, inline=False)


@router.post("/{document_id}/versoes/restaurar", summary="Restaurar versão anterior")
async def restore_version(
    document_id: uuid.UUID,
    payload: VersionRestoreRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await perm.get_document_or_404(db, document_id)
    await perm.require_document_permission(db, user, document, Permission.NEW_VERSION)
    version = await doc_service.restore_version(
        db, user=user, document=document, version_number=payload.numero
    )
    await audit.record(
        db,
        action=AuditAction.VERSION_RESTORE,
        user=user,
        resource_type="document",
        resource_id=document.id,
        resource_name=document.display_name,
        detail=f"Versão {payload.numero} restaurada como versão {version.version_number}",
        client=client_info(request),
    )
    await db.commit()
    return {
        "mensagem": (
            f"Versão {payload.numero} restaurada. "
            f"Ela passou a ser a versão {version.version_number} — "
            "as anteriores continuam disponíveis."
        ),
        "versao": VersionOut.build(version, autor_nome=user.name),
    }


# ── Movimentação, cópia e exclusão ───────────────────────────────────────────


@router.post("/{document_id}/mover", response_model=DocumentOut, summary="Mover documento")
async def move_document(
    document_id: uuid.UUID,
    payload: MoveRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await perm.get_document_or_404(db, document_id)
    await perm.require_document_permission(db, user, document, Permission.MOVE)
    destino = await perm.get_folder_or_404(db, payload.pasta_destino_id)
    await perm.require_folder_permission(db, user, destino, Permission.UPLOAD)

    origem = document.folder_id
    await doc_service.move_document(db, user=user, document=document, target_folder=destino)
    await audit.record(
        db,
        action=AuditAction.DOCUMENT_MOVE,
        user=user,
        resource_type="document",
        resource_id=document.id,
        resource_name=document.display_name,
        data_before={"pasta": str(origem)},
        data_after={"pasta": str(destino.id)},
        client=client_info(request),
    )
    await db.commit()
    return (await _decorate_many(db, user, [document]))[0]


@router.post("/{document_id}/copiar", response_model=DocumentOut, summary="Copiar documento")
async def copy_document(
    document_id: uuid.UUID,
    payload: MoveRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await perm.get_document_or_404(db, document_id)
    await perm.require_document_permission(db, user, document, Permission.COPY)
    destino = await perm.get_folder_or_404(db, payload.pasta_destino_id)
    await perm.require_folder_permission(db, user, destino, Permission.UPLOAD)

    copia = await doc_service.copy_document(
        db, user=user, document=document, target_folder=destino
    )
    await audit.record(
        db,
        action=AuditAction.DOCUMENT_COPY,
        user=user,
        resource_type="document",
        resource_id=copia.id,
        resource_name=copia.display_name,
        detail=f"Cópia de {document.code}",
        client=client_info(request),
    )
    await db.commit()
    return (await _decorate_many(db, user, [copia]))[0]


@router.post("/{document_id}/atalho", response_model=DocumentOut, summary="Criar atalho")
async def create_shortcut(
    document_id: uuid.UUID,
    payload: MoveRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await perm.get_document_or_404(db, document_id)
    await perm.require_document_permission(db, user, document, Permission.VIEW)
    destino = await perm.get_folder_or_404(db, payload.pasta_destino_id)
    await perm.require_folder_permission(db, user, destino, Permission.UPLOAD)
    atalho = await doc_service.create_shortcut(
        db, user=user, document=document, target_folder=destino
    )
    await db.commit()
    return (await _decorate_many(db, user, [atalho]))[0]


@router.delete("/{document_id}", response_model=Message, summary="Enviar para a lixeira")
async def delete_document(
    document_id: uuid.UUID,
    payload: DeleteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await perm.get_document_or_404(db, document_id)
    await perm.require_document_permission(db, user, document, Permission.DELETE)
    if doc_service.requires_justification(document) and not payload.motivo:
        raise AppError(
            "Documentos confidenciais e sigilosos exigem justificativa para exclusão.",
            422,
            "motivo_obrigatorio",
        )
    await doc_service.soft_delete(db, user=user, document=document, reason=payload.motivo)
    await audit.record(
        db,
        action=AuditAction.DOCUMENT_DELETE,
        user=user,
        resource_type="document",
        resource_id=document.id,
        resource_name=document.display_name,
        detail=payload.motivo,
        client=client_info(request),
    )
    await db.commit()
    return Message(
        mensagem=f'"{document.display_name}" foi enviado para a lixeira.',
        detalhe=f"Permanece restaurável por {settings.TRASH_RETENTION_DAYS} dias.",
    )


# ── Favoritos, bloqueio, histórico e comentários ─────────────────────────────


@router.post("/{document_id}/favorito", response_model=Message, summary="Favoritar documento")
async def toggle_favorite(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await perm.get_document_or_404(db, document_id)
    await perm.require_document_permission(db, user, document, Permission.VIEW)
    existing = await db.scalar(
        select(Favorite).where(
            Favorite.user_id == user.id,
            Favorite.resource_type == ResourceType.DOCUMENT.value,
            Favorite.resource_id == document.id,
        )
    )
    if existing:
        await db.delete(existing)
        mensagem = "Documento removido dos favoritos."
    else:
        db.add(
            Favorite(
                user_id=user.id,
                resource_type=ResourceType.DOCUMENT.value,
                resource_id=document.id,
            )
        )
        mensagem = "Documento adicionado aos favoritos."
    await db.commit()
    return Message(mensagem=mensagem)


@router.post("/{document_id}/bloqueio", summary="Bloquear documento para edição")
async def lock_document(
    document_id: uuid.UUID,
    payload: LockRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await perm.get_document_or_404(db, document_id)
    await perm.require_document_permission(db, user, document, Permission.EDIT_METADATA)
    lock = await doc_service.acquire_lock(
        db, document=document, user=user, reason=payload.motivo
    )
    await db.commit()
    return {
        "mensagem": "Documento bloqueado para edição.",
        "expira_em": lock.expires_at,
    }


@router.delete("/{document_id}/bloqueio", response_model=Message, summary="Liberar bloqueio")
async def unlock_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await perm.get_document_or_404(db, document_id)
    lock = await db.scalar(
        select(DocumentLock).where(DocumentLock.document_id == document.id)
    )
    if lock is None:
        return Message(mensagem="O documento não está bloqueado.")
    if lock.user_id != user.id and not user.is_admin:
        raise AppError(
            "Somente quem bloqueou o documento ou um administrador pode liberá-lo.",
            403,
            "bloqueio_de_terceiro",
        )
    await db.delete(lock)
    await db.commit()
    return Message(mensagem="Bloqueio liberado.")


@router.get("/{document_id}/historico", summary="Histórico do documento")
async def document_history(
    document_id: uuid.UUID,
    paginacao: Pagination = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await perm.get_document_or_404(db, document_id)
    await perm.require_document_permission(db, user, document, Permission.VIEW_HISTORY)
    stmt = select(AuditLog).where(
        AuditLog.resource_type == "document", AuditLog.resource_id == document.id
    )
    total = int(await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    rows = (
        await db.scalars(
            stmt.order_by(AuditLog.created_at.desc())
            .offset(paginacao.offset)
            .limit(paginacao.por_pagina)
        )
    ).all()
    itens = [
        {
            "id": str(row.id),
            "acao": row.action,
            "usuario": row.user_name,
            "resultado": row.result,
            "detalhe": row.detail,
            "ip": row.ip_address,
            "data_hora": row.created_at,
        }
        for row in rows
    ]
    return page_payload(itens, total, paginacao)


@router.get("/{document_id}/integridade", summary="Conferir integridade do arquivo")
async def check_integrity(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.core.security import hash_bytes

    document = await perm.get_document_or_404(db, document_id)
    await perm.require_document_permission(db, user, document, Permission.VIEW_VERSIONS)
    versions = (
        await db.scalars(
            select(DocumentVersion).where(DocumentVersion.document_id == document.id)
        )
    ).all()
    storage = get_storage()
    resultado = []
    for version in versions:
        try:
            data = await storage.get(version.storage_key)
            atual = hash_bytes(data)
            resultado.append(
                {
                    "versao": version.version_number,
                    "sha256_registrado": version.sha256,
                    "sha256_atual": atual,
                    "situacao": "integro" if atual == version.sha256 else "divergente",
                }
            )
        except Exception:
            resultado.append(
                {
                    "versao": version.version_number,
                    "sha256_registrado": version.sha256,
                    "sha256_atual": None,
                    "situacao": "ausente",
                }
            )
    return {
        "documento": document.code,
        "verificacoes": resultado,
        "integro": all(item["situacao"] == "integro" for item in resultado),
    }


@router.get(
    "/{document_id}/comentarios", response_model=List[CommentOut], summary="Listar comentários"
)
async def list_comments(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    document = await perm.get_document_or_404(db, document_id)
    await perm.require_document_permission(db, user, document, Permission.VIEW)
    comments = list(
        (
            await db.scalars(
                select(Comment)
                .where(Comment.document_id == document.id, Comment.deleted_at.is_(None))
                .order_by(Comment.created_at)
            )
        ).all()
    )
    names = await user_names(db, [c.author_id for c in comments])
    result = []
    for comment in comments:
        mentions = (
            await db.scalars(
                select(CommentMention.user_id).where(
                    CommentMention.comment_id == comment.id
                )
            )
        ).all()
        result.append(
            CommentOut(
                id=comment.id,
                texto=comment.body,
                autor_id=comment.author_id,
                autor_nome=names.get(comment.author_id),
                responde_a=comment.parent_id,
                resolvido=comment.resolved_at is not None,
                criado_em=comment.created_at,
                editado_em=comment.edited_at,
                mencionados=list(mentions),
            )
        )
    return result


@router.post(
    "/{document_id}/comentarios",
    response_model=CommentOut,
    status_code=201,
    summary="Comentar documento",
)
async def create_comment(
    document_id: uuid.UUID,
    payload: CommentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.models.enums import NotificationType

    document = await perm.get_document_or_404(db, document_id)
    await perm.require_document_permission(db, user, document, Permission.VIEW)

    comment = Comment(
        document_id=document.id,
        parent_id=payload.responde_a,
        author_id=user.id,
        body=payload.texto,
        created_by_id=user.id,
    )
    db.add(comment)
    await db.flush()
    for mentioned in payload.mencionados:
        db.add(CommentMention(comment_id=comment.id, user_id=mentioned))
        await notifications.notify(
            db,
            user_id=mentioned,
            type_=NotificationType.MENCAO,
            title=f"{user.name} mencionou você em {document.display_name}",
            body=payload.texto[:200],
            resource_type="document",
            resource_id=document.id,
        )
    if document.owner_user_id and document.owner_user_id != user.id:
        await notifications.notify(
            db,
            user_id=document.owner_user_id,
            type_=NotificationType.COMENTARIO,
            title=f"Novo comentário em {document.display_name}",
            body=payload.texto[:200],
            resource_type="document",
            resource_id=document.id,
        )
    await db.commit()
    return CommentOut(
        id=comment.id,
        texto=comment.body,
        autor_id=user.id,
        autor_nome=user.name,
        responde_a=comment.parent_id,
        resolvido=False,
        criado_em=comment.created_at,
        mencionados=payload.mencionados,
    )
