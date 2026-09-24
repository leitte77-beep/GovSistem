"""Ajustes da prefeitura no módulo. Sem linha no banco, valem os padrões."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.config import Ajustes

DIAS_ALERTA_PADRAO = 15


async def obter(db: AsyncSession, organization_id: uuid.UUID) -> Ajustes:
    """Ajustes da organização; um objeto transitório com os padrões se não houver."""
    ajustes = await db.scalar(
        select(Ajustes).where(Ajustes.organization_id == organization_id)
    )
    if ajustes is None:
        ajustes = Ajustes(
            organization_id=organization_id,
            dias_alerta_parado=DIAS_ALERTA_PADRAO,
            resumo_diario=True,
            resumo_hora=7,
            resumo_perfis=["PREFEITO"],
        )
    return ajustes


async def salvar(db: AsyncSession, organization_id: uuid.UUID, dados: dict) -> Ajustes:
    ajustes = await db.scalar(
        select(Ajustes).where(Ajustes.organization_id == organization_id)
    )
    if ajustes is None:
        ajustes = Ajustes(
            organization_id=organization_id,
            dias_alerta_parado=DIAS_ALERTA_PADRAO,
            resumo_diario=True,
            resumo_hora=7,
            resumo_perfis=["PREFEITO"],
        )
        db.add(ajustes)
    for campo, valor in dados.items():
        if valor is not None:
            setattr(ajustes, campo, valor)
    await db.flush()
    return ajustes
