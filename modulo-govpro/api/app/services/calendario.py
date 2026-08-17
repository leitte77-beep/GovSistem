"""Calendário de feriados (nacional + estadual + municipal + pontos facultativos)."""

import uuid
from datetime import date
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gestao import Feriado
from app.models.user import User
from app.services.auditoria import registrar


async def feriados_do_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> set[date]:
    result = await db.execute(
        select(Feriado.data).where(Feriado.tenant_id == tenant_id, Feriado.ativo.is_(True))
    )
    return set(result.scalars())


async def adicionar_feriado(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    data: date,
    nome: str,
    escopo: str = "NACIONAL",
    ponto_facultativo: bool = False,
    client: Optional[dict] = None,
) -> Feriado:
    result = await db.execute(
        select(Feriado).where(Feriado.tenant_id == tenant_id, Feriado.data == data)
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Data já cadastrada")

    feriado = Feriado(
        tenant_id=tenant_id,
        data=data,
        nome=nome.strip(),
        escopo=escopo,
        ponto_facultativo=ponto_facultativo,
    )
    db.add(feriado)

    await registrar(
        db,
        tenant_id=tenant_id,
        action="PARAMETRIZACAO",
        entity="feriado",
        entity_id=str(feriado.id),
        actor_user_id=user.id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        dados_depois={"data": data.isoformat(), "nome": nome},
    )

    await db.commit()
    await db.refresh(feriado)
    return feriado


async def remover_feriado(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    data: date,
    client: Optional[dict] = None,
) -> None:
    result = await db.execute(
        select(Feriado).where(Feriado.tenant_id == tenant_id, Feriado.data == data)
    )
    feriado = result.scalar_one_or_none()
    if feriado is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feriado não encontrado")

    feriado.ativo = False

    await registrar(
        db,
        tenant_id=tenant_id,
        action="PARAMETRIZACAO",
        entity="feriado",
        entity_id=str(feriado.id),
        actor_user_id=user.id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
    )

    await db.commit()
