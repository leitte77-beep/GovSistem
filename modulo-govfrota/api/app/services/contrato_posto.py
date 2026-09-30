"""Contratos com postos credenciados: contrato vigente e saldo em litros."""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func as sa_func
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.abastecimento import Abastecimento
from app.models.combustivel import ContratoPosto


async def contrato_vigente(
    db: AsyncSession,
    organization_id: uuid.UUID,
    fornecedor_id: uuid.UUID,
    combustivel_id: uuid.UUID,
    em: date,
) -> ContratoPosto | None:
    """Contrato ativo do posto para o combustível na data; o mais recente vence."""
    return (
        await db.execute(
            select(ContratoPosto)
            .where(
                ContratoPosto.organization_id == organization_id,
                ContratoPosto.fornecedor_id == fornecedor_id,
                ContratoPosto.combustivel_id == combustivel_id,
                ContratoPosto.deleted_at.is_(None),
                ContratoPosto.ativo.is_(True),
                or_(ContratoPosto.data_inicio.is_(None), ContratoPosto.data_inicio <= em),
                or_(ContratoPosto.data_fim.is_(None), ContratoPosto.data_fim >= em),
            )
            .order_by(ContratoPosto.data_inicio.desc().nulls_last(), ContratoPosto.created_at.desc())
            .limit(1)
        )
    ).scalars().first()


async def litros_consumidos(db: AsyncSession, contrato_ids: list[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
    """Litros de abastecimentos confirmados por contrato (cancelados devolvem saldo)."""
    if not contrato_ids:
        return {}
    linhas = (
        await db.execute(
            select(
                Abastecimento.contrato_posto_id,
                sa_func.coalesce(sa_func.sum(Abastecimento.quantidade_litros), 0),
            )
            .where(
                Abastecimento.contrato_posto_id.in_(contrato_ids),
                Abastecimento.status == "CONFIRMADO",
                Abastecimento.deleted_at.is_(None),
            )
            .group_by(Abastecimento.contrato_posto_id)
        )
    ).all()
    consumidos = {cid: Decimal("0") for cid in contrato_ids}
    for cid, litros in linhas:
        consumidos[cid] = Decimal(str(litros))
    return consumidos


async def saldo_litros(db: AsyncSession, contrato: ContratoPosto) -> Decimal:
    consumido = (await litros_consumidos(db, [contrato.id]))[contrato.id]
    return Decimal(contrato.litros_contratados) - consumido
