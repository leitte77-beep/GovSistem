"""Auditoria — registro centralizado de operações críticas."""

import json
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auditoria import Auditoria


def _serialize(data: Any) -> str | None:
    if data is None:
        return None
    if isinstance(data, str):
        return data
    return json.dumps(data, default=str, ensure_ascii=False)


async def registrar_auditoria(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    acao: str,
    entidade: str,
    entidade_id: uuid.UUID | None = None,
    usuario_id: uuid.UUID | None = None,
    motorista_id: uuid.UUID | None = None,
    dados_anteriores: Any = None,
    dados_novos: Any = None,
    justificativa: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> Auditoria:
    registro = Auditoria(
        organization_id=organization_id,
        acao=acao,
        entidade=entidade,
        entidade_id=entidade_id,
        usuario_id=usuario_id,
        motorista_id=motorista_id,
        dados_anteriores=_serialize(dados_anteriores),
        dados_novos=_serialize(dados_novos),
        justificativa=justificativa,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(registro)
    await db.flush()
    return registro
