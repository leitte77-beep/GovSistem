"""Base de conhecimento por tipo de processo (orientação ao servidor)."""

import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gestao import BaseConhecimento
from app.models.user import User
from app.services.auditoria import registrar


async def criar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    tipo_processo_id: Optional[uuid.UUID],
    titulo: str,
    conteudo: str,
    base_legal: Optional[str] = None,
    client: Optional[dict] = None,
) -> BaseConhecimento:
    item = BaseConhecimento(
        tenant_id=tenant_id,
        tipo_processo_id=tipo_processo_id,
        titulo=titulo.strip(),
        conteudo=conteudo,
        base_legal=base_legal,
    )
    db.add(item)

    await registrar(
        db,
        tenant_id=tenant_id,
        action="PARAMETRIZACAO",
        entity="base_conhecimento",
        entity_id=str(item.id),
        actor_user_id=user.id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
    )

    await db.commit()
    await db.refresh(item)
    return item


async def listar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    tipo_processo_id: Optional[uuid.UUID] = None,
) -> list[BaseConhecimento]:
    stmt = select(BaseConhecimento).where(
        BaseConhecimento.tenant_id == tenant_id, BaseConhecimento.ativo.is_(True)
    )
    if tipo_processo_id is not None:
        stmt = stmt.where(BaseConhecimento.tipo_processo_id == tipo_processo_id)
    stmt = stmt.order_by(BaseConhecimento.titulo)
    result = await db.execute(stmt)
    return list(result.scalars())
