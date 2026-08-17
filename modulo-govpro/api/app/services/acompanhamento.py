"""Acompanhamento especial: marcar processos de interesse e receber avisos."""

import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gestao import AcompanhamentoEspecial
from app.models.processo import Processo
from app.models.user import User


async def marcar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    etiqueta: Optional[str] = None,
) -> AcompanhamentoEspecial:
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")

    result = await db.execute(
        select(AcompanhamentoEspecial).where(
            AcompanhamentoEspecial.processo_id == processo_id,
            AcompanhamentoEspecial.usuario_id == user.id,
        )
    )
    acompanhamento = result.scalar_one_or_none()
    if acompanhamento is None:
        acompanhamento = AcompanhamentoEspecial(
            tenant_id=tenant_id,
            processo_id=processo_id,
            usuario_id=user.id,
            etiqueta=etiqueta,
        )
        db.add(acompanhamento)
    else:
        acompanhamento.ativo = True
        acompanhamento.etiqueta = etiqueta

    await db.commit()
    await db.refresh(acompanhamento)
    return acompanhamento


async def desmarcar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
) -> None:
    result = await db.execute(
        select(AcompanhamentoEspecial).where(
            AcompanhamentoEspecial.processo_id == processo_id,
            AcompanhamentoEspecial.usuario_id == user.id,
            AcompanhamentoEspecial.ativo.is_(True),
        )
    )
    acompanhamento = result.scalar_one_or_none()
    if acompanhamento is not None:
        acompanhamento.ativo = False
        await db.commit()


async def listar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario_id: uuid.UUID,
) -> list[AcompanhamentoEspecial]:
    result = await db.execute(
        select(AcompanhamentoEspecial).where(
            AcompanhamentoEspecial.tenant_id == tenant_id,
            AcompanhamentoEspecial.usuario_id == usuario_id,
            AcompanhamentoEspecial.ativo.is_(True),
        )
    )
    return list(result.scalars())
