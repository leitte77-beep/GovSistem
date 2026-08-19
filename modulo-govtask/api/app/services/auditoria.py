"""Registra eventos de auditoria técnica (append-only, não editável por usuários comuns)."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auditoria import Auditoria


def _client_info(request) -> tuple[Optional[str], Optional[str]]:
    """Extrai IP e user-agent de um request FastAPI, de forma tolerante."""
    if request is None:
        return None, None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = getattr(getattr(request, "client", None), "host", None)
    ua = request.headers.get("user-agent")
    return ip, (ua[:255] if ua else None)


async def registrar_auditoria(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None,
    organization_id: uuid.UUID | None,
    acao: str,
    convenio_id: uuid.UUID | None = None,
    entidade: str | None = None,
    entidade_id: uuid.UUID | None = None,
    dados_anteriores: dict | None = None,
    dados_posteriores: dict | None = None,
    request=None,
) -> Auditoria:
    """Persiste um registro de auditoria. Nunca deve ser editado por usuários comuns."""
    ip, ua = _client_info(request)
    registro = Auditoria(
        user_id=user_id,
        organization_id=organization_id,
        convenio_id=convenio_id,
        acao=acao,
        entidade=entidade,
        entidade_id=entidade_id,
        dados_anteriores=dados_anteriores,
        dados_posteriores=dados_posteriores,
        ip=ip,
        user_agent=ua,
        ocorrido_em=datetime.now(timezone.utc),
    )
    db.add(registro)
    await db.flush()
    return registro
