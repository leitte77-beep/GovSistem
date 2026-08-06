"""Links externos e solicitações externas de documentos.

O token nunca é gravado em claro: guarda-se o SHA-256. Cada acesso é registrado
em `external_access_logs`, inclusive as tentativas recusadas.
"""

import ipaddress
import uuid
from datetime import datetime, timezone
from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFound
from app.core.security import sha256_hex, verify_password
from app.core.timeutils import aware, is_past
from app.models.enums import ResourceType
from app.models.sharing import (
    ExternalAccessLog,
    ExternalLink,
    ExternalLinkItem,
    ExternalUploadRequest,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ExternalDenied(AppError):
    def __init__(self, message: str, code: str = "acesso_externo_negado", status: int = 403):
        super().__init__(message, status, code)


async def log_access(
    db: AsyncSession,
    *,
    action: str,
    result: str,
    link_id: Optional[uuid.UUID] = None,
    request_id: Optional[uuid.UUID] = None,
    document_id: Optional[uuid.UUID] = None,
    client: Optional[dict] = None,
    visitor: Optional[dict] = None,
    detail: Optional[str] = None,
) -> None:
    client = client or {}
    visitor = visitor or {}
    db.add(
        ExternalAccessLog(
            link_id=link_id,
            request_id=request_id,
            action=action,
            document_id=document_id,
            ip_address=client.get("ip_address"),
            user_agent=client.get("user_agent"),
            visitor_name=(visitor.get("nome") or None),
            visitor_email=(visitor.get("email") or None),
            visitor_phone=(visitor.get("telefone") or None),
            result=result,
            detail=(detail or "")[:400] or None,
        )
    )


def _ip_allowed(allowed: Optional[Sequence[str]], ip: Optional[str]) -> bool:
    if not allowed:
        return True
    if not ip:
        return False
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return False
    for entry in allowed:
        entry = entry.strip()
        if not entry:
            continue
        try:
            if "/" in entry:
                if address in ipaddress.ip_network(entry, strict=False):
                    return True
            elif address == ipaddress.ip_address(entry):
                return True
        except ValueError:
            continue
    return False


async def resolve_link(db: AsyncSession, token: str) -> ExternalLink:
    link = await db.scalar(
        select(ExternalLink).where(ExternalLink.token_hash == sha256_hex(token))
    )
    if link is None:
        raise NotFound("Link não encontrado. Verifique o endereço recebido.")
    return link


def assert_link_usable(link: ExternalLink, *, ip: Optional[str] = None) -> None:
    now = _now()
    if link.revoked_at is not None:
        raise ExternalDenied(
            "Este compartilhamento foi revogado pelo responsável.", "link_revogado", 410
        )
    if is_past(link.expires_at, now):
        quando = aware(link.expires_at).strftime("%d/%m/%Y às %H:%M")
        raise ExternalDenied(
            f"O link compartilhado expirou em {quando}.", "link_expirado", 410
        )
    if link.max_accesses is not None and link.access_count >= link.max_accesses:
        raise ExternalDenied(
            "Este link atingiu o número máximo de acessos permitidos.",
            "limite_acessos",
            410,
        )
    if not _ip_allowed(link.allowed_ips, ip):
        raise ExternalDenied(
            "Este link só pode ser acessado a partir de endereços autorizados.",
            "ip_nao_autorizado",
        )


def assert_password(link: ExternalLink, password: Optional[str]) -> None:
    if not link.password_hash:
        return
    if not password or not verify_password(password, link.password_hash):
        raise ExternalDenied("Senha incorreta.", "senha_incorreta", 401)


def assert_identification(link: ExternalLink, visitor: dict) -> None:
    if link.require_name and not (visitor.get("nome") or "").strip():
        raise AppError("Informe seu nome para acessar os arquivos.", 422, "identificacao")
    if link.require_email and not (visitor.get("email") or "").strip():
        raise AppError("Informe seu e-mail para acessar os arquivos.", 422, "identificacao")
    if link.require_phone and not (visitor.get("telefone") or "").strip():
        raise AppError("Informe seu telefone para acessar os arquivos.", 422, "identificacao")


def assert_download_allowed(link: ExternalLink) -> None:
    if not link.allow_download:
        raise ExternalDenied(
            "Este compartilhamento permite apenas a visualização dos documentos.",
            "download_bloqueado",
        )
    if link.max_downloads is not None and link.download_count >= link.max_downloads:
        raise ExternalDenied(
            "Este link atingiu o número máximo de downloads permitidos.",
            "limite_downloads",
            410,
        )


async def link_document_ids(db: AsyncSession, link: ExternalLink) -> list:
    """Documentos alcançáveis pelo link (itens diretos + conteúdo das pastas)."""
    from app.models.document import Document
    from app.models.folder import Folder

    items = (
        await db.scalars(
            select(ExternalLinkItem).where(ExternalLinkItem.link_id == link.id)
        )
    ).all()
    document_ids = [
        item.resource_id for item in items if item.resource_type == ResourceType.DOCUMENT.value
    ]
    folder_ids = [
        item.resource_id for item in items if item.resource_type == ResourceType.FOLDER.value
    ]
    if folder_ids:
        folders = (await db.scalars(select(Folder).where(Folder.id.in_(folder_ids)))).all()
        all_folder_ids = set(folder_ids)
        for folder in folders:
            descendants = (
                await db.scalars(
                    select(Folder.id).where(
                        Folder.materialized_path.like(f"{folder.child_path()}%"),
                        Folder.deleted_at.is_(None),
                    )
                )
            ).all()
            all_folder_ids.update(descendants)
        rows = (
            await db.scalars(
                select(Document.id).where(
                    Document.folder_id.in_(all_folder_ids),
                    Document.deleted_at.is_(None),
                )
            )
        ).all()
        document_ids.extend(rows)
    return list(dict.fromkeys(document_ids))


async def resolve_request(db: AsyncSession, token: str) -> ExternalUploadRequest:
    request = await db.scalar(
        select(ExternalUploadRequest).where(
            ExternalUploadRequest.token_hash == sha256_hex(token)
        )
    )
    if request is None:
        raise NotFound("Solicitação não encontrada. Verifique o endereço recebido.")
    return request


def assert_request_usable(request: ExternalUploadRequest) -> None:
    if request.revoked_at is not None:
        raise ExternalDenied(
            "Esta solicitação de envio foi encerrada pelo responsável.", "solicitacao_encerrada",
            410,
        )
    if is_past(request.deadline):
        quando = aware(request.deadline).strftime("%d/%m/%Y às %H:%M")
        raise ExternalDenied(
            f"O prazo para envio encerrou em {quando}.", "prazo_encerrado", 410
        )
