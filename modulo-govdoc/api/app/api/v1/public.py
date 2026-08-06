"""Acesso externo — rotas públicas, sem autenticação interna.

Nada aqui expõe a navegação do sistema: o visitante enxerga apenas os arquivos
autorizados pelo link. Toda tentativa (válida ou não) vira registro.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import client_info
from app.core.config import settings
from app.core.database import get_db
from app.core.errors import AppError, NotFound
from app.core.security import create_access_token, hash_bytes, verify_password
from app.core.storage import build_quarantine_key, get_storage, iter_file
from app.models.document import Document, DocumentVersion
from app.models.enums import (
    AuditAction,
    ExternalRequestStatus,
    FileStatus,
    NotificationType,
)
from app.models.organization import Institution
from app.models.sharing import ExternalLink, ExternalUpload, ExternalUploadRequest
from app.schemas.sharing import ExternalAccessIn
from app.services import audit, external_access, notifications
from app.services.files import scan_bytes, validate_upload

router = APIRouter(prefix="/publico", tags=["Acesso externo"])

SESSION_MINUTES = 30


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _issue_session(link_id: uuid.UUID, visitor: dict) -> str:
    return create_access_token(
        str(link_id),
        extra={
            "type": "external_session",
            "link": str(link_id),
            "visitante": {
                "nome": visitor.get("nome"),
                "email": visitor.get("email"),
                "telefone": visitor.get("telefone"),
            },
        },
        expires_minutes=SESSION_MINUTES,
    )


def _read_session(token: str) -> dict:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY.get_secret_value(), algorithms=[settings.ALGORITHM]
        )
    except jwt.PyJWTError:
        raise AppError(
            "Sua sessão de acesso expirou. Abra o link novamente.", 401, "sessao_externa_expirada"
        )
    if payload.get("type") != "external_session":
        raise AppError("Sessão inválida.", 401, "sessao_invalida")
    return payload


# ── Consulta de documentos compartilhados ────────────────────────────────────


@router.get("/acesso/{token}", summary="Informações públicas do link")
async def link_info(
    token: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Mostra apenas o necessário para a tela de acesso (sem listar arquivos)."""
    link = await external_access.resolve_link(db, token)
    client = client_info(request)
    try:
        external_access.assert_link_usable(link, ip=client.get("ip_address"))
    except AppError as exc:
        await external_access.log_access(
            db,
            action="abrir",
            result="negado",
            link_id=link.id,
            client=client,
            detail=exc.message,
        )
        await db.commit()
        raise

    institution = await db.get(Institution, link.institution_id)
    return {
        "nome": link.name,
        "descricao": link.description,
        "instituicao": institution.name if institution else "",
        "cor_primaria": institution.primary_color if institution else "#1e40af",
        "expira_em": link.expires_at,
        "permitir_download": link.allow_download,
        "marca_dagua": link.watermark,
        "termo_responsabilidade": link.terms_text,
        "exige_senha": link.password_hash is not None,
        "exigir_nome": link.require_name,
        "exigir_email": link.require_email,
        "exigir_telefone": link.require_phone,
    }


@router.post("/acesso/{token}", summary="Abrir link externo")
async def open_link(
    token: str,
    payload: ExternalAccessIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    link = await external_access.resolve_link(db, token)
    client = client_info(request)
    visitor = {
        "nome": payload.nome,
        "email": payload.email,
        "telefone": payload.telefone,
    }

    try:
        external_access.assert_link_usable(link, ip=client.get("ip_address"))
        external_access.assert_password(link, payload.senha)
        external_access.assert_identification(link, visitor)
    except AppError as exc:
        await external_access.log_access(
            db,
            action="abrir",
            result="negado",
            link_id=link.id,
            client=client,
            visitor=visitor,
            detail=exc.message,
        )
        await db.commit()
        raise

    document_ids = await external_access.link_document_ids(db, link)
    documentos = []
    if document_ids:
        rows = (
            await db.scalars(
                select(Document).where(
                    Document.id.in_(document_ids), Document.deleted_at.is_(None)
                )
            )
        ).all()
        documentos = [
            {
                "id": str(doc.id),
                "nome": doc.display_name,
                "codigo": doc.code,
                "tamanho_bytes": doc.size_bytes,
                "extensao": doc.extension,
                "mime": doc.mime_type,
                "data": doc.document_date,
                "atualizado_em": doc.updated_at,
            }
            for doc in rows
            if doc.file_status != FileStatus.BLOCKED.value
        ]

    link.access_count += 1
    await external_access.log_access(
        db,
        action="abrir",
        result="sucesso",
        link_id=link.id,
        client=client,
        visitor=visitor,
    )
    if link.notify_on_access and link.created_by_id:
        await notifications.notify(
            db,
            user_id=link.created_by_id,
            type_=NotificationType.LINK_ACESSADO,
            title=f"O link “{link.name}” foi acessado",
            body=(
                f"Acesso de {payload.nome or 'visitante'} "
                f"({client.get('ip_address')})."
            ),
            resource_type="external_link",
            resource_id=link.id,
        )
    await db.commit()

    institution = await db.get(Institution, link.institution_id)
    return {
        "sessao": _issue_session(link.id, visitor),
        "expira_sessao_minutos": SESSION_MINUTES,
        "nome": link.name,
        "descricao": link.description,
        "instituicao": institution.name if institution else "",
        "expira_em": link.expires_at,
        "permitir_download": link.allow_download,
        "marca_dagua": link.watermark,
        "documentos": documentos,
    }


async def _authorize_document(
    db: AsyncSession, sessao: str, document_id: uuid.UUID
) -> tuple:
    payload = _read_session(sessao)
    link = await db.get(ExternalLink, uuid.UUID(payload["link"]))
    if link is None:
        raise NotFound("Link não encontrado.")
    external_access.assert_link_usable(link)

    permitidos = await external_access.link_document_ids(db, link)
    if document_id not in permitidos:
        raise AppError(
            "Este documento não faz parte do compartilhamento.", 403, "documento_fora_do_link"
        )
    document = await db.get(Document, document_id)
    if document is None or document.deleted_at is not None:
        raise NotFound("Documento não está mais disponível.")
    return link, document, payload.get("visitante") or {}


@router.get("/acesso/documentos/{document_id}/download", summary="Baixar documento do link")
async def external_download(
    document_id: uuid.UUID,
    request: Request,
    sessao: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    link, document, visitor = await _authorize_document(db, sessao, document_id)
    client = client_info(request)
    try:
        external_access.assert_download_allowed(link)
    except AppError as exc:
        await external_access.log_access(
            db,
            action="download",
            result="negado",
            link_id=link.id,
            document_id=document_id,
            client=client,
            visitor=visitor,
            detail=exc.message,
        )
        await db.commit()
        raise

    version = await db.get(DocumentVersion, document.current_version_id)
    if version is None:
        raise NotFound("Arquivo não disponível.")

    link.download_count += 1
    document.download_count += 1
    await external_access.log_access(
        db,
        action="download",
        result="sucesso",
        link_id=link.id,
        document_id=document_id,
        client=client,
        visitor=visitor,
    )
    await audit.record(
        db,
        action=AuditAction.EXTERNAL_DOWNLOAD,
        institution_id=document.institution_id,
        resource_type="document",
        resource_id=document.id,
        resource_name=document.display_name,
        detail=f"Download externo via link {link.name}",
        client=client,
    )
    if link.notify_on_download and link.created_by_id:
        await notifications.notify(
            db,
            user_id=link.created_by_id,
            type_=NotificationType.LINK_ACESSADO,
            title=f"Download em “{link.name}”",
            body=f"{document.display_name} foi baixado.",
            resource_type="external_link",
            resource_id=link.id,
        )
    await db.commit()

    nome = version.original_name.replace('"', "")
    return StreamingResponse(
        iter_file(version.storage_key),
        media_type=version.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{nome}"',
            "Cache-Control": "private, no-store",
        },
    )


@router.get("/acesso/documentos/{document_id}/visualizar", summary="Visualizar documento do link")
async def external_preview(
    document_id: uuid.UUID,
    request: Request,
    sessao: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    link, document, visitor = await _authorize_document(db, sessao, document_id)
    if not link.allow_view:
        raise AppError("Este link não permite visualização.", 403, "visualizacao_bloqueada")
    version = await db.get(DocumentVersion, document.current_version_id)
    if version is None:
        raise NotFound("Arquivo não disponível.")

    await external_access.log_access(
        db,
        action="visualizar",
        result="sucesso",
        link_id=link.id,
        document_id=document_id,
        client=client_info(request),
        visitor=visitor,
    )
    await db.commit()
    return StreamingResponse(
        iter_file(version.storage_key),
        media_type=version.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": "inline",
            "Cache-Control": "private, no-store",
        },
    )


# ── Recebimento externo ──────────────────────────────────────────────────────


@router.get("/envio/{token}", summary="Informações da solicitação de envio")
async def request_info(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    solicitacao = await external_access.resolve_request(db, token)
    client = client_info(request)
    try:
        external_access.assert_request_usable(solicitacao)
    except AppError as exc:
        await external_access.log_access(
            db,
            action="abrir_envio",
            result="negado",
            request_id=solicitacao.id,
            client=client,
            detail=exc.message,
        )
        await db.commit()
        raise

    institution = await db.get(Institution, solicitacao.institution_id)
    return {
        "titulo": solicitacao.title,
        "descricao": solicitacao.description,
        "instituicao": institution.name if institution else "",
        "cor_primaria": institution.primary_color if institution else "#1e40af",
        "prazo": solicitacao.deadline,
        "extensoes_aceitas": solicitacao.allowed_extensions or settings.ALLOWED_EXTENSIONS,
        "tamanho_maximo_mb": solicitacao.max_file_size_mb,
        "quantidade_maxima": solicitacao.max_files,
        "exige_senha": solicitacao.password_hash is not None,
        "exigir_identificacao": solicitacao.require_identification,
        "exigir_email": solicitacao.require_email,
        "termo_responsabilidade": solicitacao.terms_text,
        "observacoes": solicitacao.notes,
    }


@router.post("/envio/{token}", status_code=201, summary="Enviar documento externo")
async def external_upload(
    token: str,
    request: Request,
    arquivo: UploadFile = File(...),
    nome: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    telefone: Optional[str] = Form(None),
    observacao: Optional[str] = Form(None),
    senha: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    solicitacao = await external_access.resolve_request(db, token)
    client = client_info(request)
    visitor = {"nome": nome, "email": email, "telefone": telefone}

    async def _deny(mensagem: str, code: str = "envio_negado", status: int = 403):
        await external_access.log_access(
            db,
            action="envio",
            result="negado",
            request_id=solicitacao.id,
            client=client,
            visitor=visitor,
            detail=mensagem,
        )
        await db.commit()
        raise AppError(mensagem, status, code)

    try:
        external_access.assert_request_usable(solicitacao)
    except AppError as exc:
        await _deny(exc.message, exc.code, exc.status_code)

    if solicitacao.password_hash and not (
        senha and verify_password(senha, solicitacao.password_hash)
    ):
        await _deny("Senha incorreta.", "senha_incorreta", 401)
    if solicitacao.require_identification and not (nome or "").strip():
        await _deny("Informe seu nome para enviar documentos.", "identificacao", 422)
    if solicitacao.require_email and not (email or "").strip():
        await _deny("Informe seu e-mail para enviar documentos.", "identificacao", 422)

    enviados = int(
        await db.scalar(
            select(__import__("sqlalchemy").func.count(ExternalUpload.id)).where(
                ExternalUpload.request_id == solicitacao.id
            )
        )
        or 0
    )
    if enviados >= solicitacao.max_files:
        await _deny(
            "Esta solicitação já atingiu o número máximo de arquivos.", "limite_arquivos", 409
        )

    data = await arquivo.read()
    validacao = validate_upload(
        arquivo.filename or "arquivo",
        data,
        allowed_extensions=solicitacao.allowed_extensions,
        max_size_bytes=solicitacao.max_file_size_mb * 1024 * 1024,
    )
    if not validacao.ok:
        await _deny(validacao.message, "arquivo_invalido", 422)

    limpo, detalhe = scan_bytes(data)
    upload_id = uuid.uuid4()
    key = build_quarantine_key(solicitacao.id, upload_id, uuid.uuid4().hex)
    await get_storage().put(key, data)

    upload = ExternalUpload(
        id=upload_id,
        request_id=solicitacao.id,
        original_name=validacao.safe_name,
        storage_key=key,
        mime_type=validacao.mime_type,
        extension=validacao.extension,
        size_bytes=validacao.size,
        sha256=hash_bytes(data),
        sender_name=nome,
        sender_email=email,
        sender_phone=telefone,
        sender_note=observacao,
        ip_address=client.get("ip_address"),
        file_status=(
            FileStatus.QUARANTINE.value if limpo else FileStatus.BLOCKED.value
        ),
        scan_result=detalhe[:300],
        status=(
            ExternalRequestStatus.RECEBIDO.value
            if limpo
            else ExternalRequestStatus.REJEITADO.value
        ),
        review_note=None if limpo else f"Bloqueado na verificação: {detalhe}",
    )
    db.add(upload)

    await external_access.log_access(
        db,
        action="envio",
        result="sucesso" if limpo else "bloqueado",
        request_id=solicitacao.id,
        client=client,
        visitor=visitor,
        detail=f"{validacao.safe_name} ({validacao.size} bytes)",
    )
    await notifications.notify(
        db,
        user_id=solicitacao.owner_user_id,
        type_=(
            NotificationType.UPLOAD_EXTERNO if limpo else NotificationType.ARQUIVO_BLOQUEADO
        ),
        title=(
            f"Novo documento recebido em “{solicitacao.title}”"
            if limpo
            else f"Arquivo externo bloqueado em “{solicitacao.title}”"
        ),
        body=f"{validacao.safe_name} — enviado por {nome or 'remetente não identificado'}.",
        resource_type="external_upload",
        resource_id=upload.id,
    )
    await db.commit()

    if not limpo:
        raise AppError(
            "O arquivo não pôde ser aceito porque foi reprovado na verificação de segurança.",
            422,
            "arquivo_bloqueado",
        )

    return {
        "mensagem": (
            "Documento enviado com sucesso. Ele passará por conferência antes de ser "
            "incorporado ao repositório."
        ),
        "protocolo": str(upload.id),
        "arquivo": validacao.safe_name,
    }
