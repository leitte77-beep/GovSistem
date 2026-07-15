"""Engine de cálculo do Índice de Vulnerabilidade Social (Fase 3.6).

Calcula a pontuação do IVS com base em critérios configuráveis:
renda per capita, benefícios, violências, programas sociais, atendimentos.
"""

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.beneficio import ConcessaoBeneficio
from app.models.family import Family
from app.models.ivs import IvsCalculo, IvsCriterio
from app.models.socioeconomico import RendaMembro, VulnerabilidadeFamiliar

logger = logging.getLogger("govsocial.ivs")

NIVEIS = [(0.0, "NAO_VULNERAVEL"), (15.0, "MUITO_BAIXA"), (30.0, "BAIXA"), (50.0, "MEDIA"), (70.0, "ALTA"), (85.0, "MUITO_ALTA")]


def classificar(pontuacao: float) -> str:
    for limite, nivel in reversed(NIVEIS):
        if pontuacao >= limite:
            return nivel
    return "NAO_VULNERAVEL"


async def calcular_ivs_familia(db: AsyncSession, family_id: str, tenant_id: str) -> IvsCalculo:
    criterios = (await db.execute(
        select(IvsCriterio).where(IvsCriterio.tenant_id == tenant_id, IvsCriterio.ativo == True)
    )).scalars().all()

    if not criterios:
        criterios = [
            IvsCriterio(tenant_id=tenant_id, nome="Renda per capita", peso=2.0, formula="renda_per_capita"),
            IvsCriterio(tenant_id=tenant_id, nome="Benefícios eventuais", peso=1.5, formula="nro_beneficios"),
            IvsCriterio(tenant_id=tenant_id, nome="Violências/violações", peso=2.0, formula="nro_violencias"),
            IvsCriterio(tenant_id=tenant_id, nome="Programas sociais", peso=1.0, formula="programas_sociais"),
        ]

    pontuacao = 0.0
    max_pontuacao = sum(c.peso for c in criterios) * 10.0

    for c in criterios:
        valor = await _avaliar_formula(db, c.formula, family_id, tenant_id)
        pontuacao += valor * c.peso

    pontuacao = min((pontuacao / max_pontuacao) * 100.0 if max_pontuacao > 0 else 0.0, 100.0)
    nivel = classificar(pontuacao)

    calc = IvsCalculo(tenant_id=tenant_id, family_id=family_id, pontuacao=round(pontuacao, 1), nivel=nivel, automatico=True, data_calculo=func.now())
    db.add(calc)
    await db.commit()
    await db.refresh(calc)
    return calc


async def _avaliar_formula(db: AsyncSession, formula: str, family_id: str, tenant_id: str) -> float:
    if formula == "renda_per_capita":
        r = (await db.execute(
            select(func.coalesce(func.sum(RendaMembro.valor), 0)).where(RendaMembro.family_id == family_id)
        )).scalar()
        family = (await db.execute(select(Family).where(Family.id == family_id))).scalar_one_or_none()
        membros = len(family.members) if family and family.members else 1
        per_capita = float(r) / membros if membros > 0 else float(r)
        return max(0.0, min(10.0, 10.0 - (per_capita / 200.0)))

    elif formula == "nro_beneficios":
        count = (await db.execute(
            select(func.count()).where(ConcessaoBeneficio.family_id == family_id)
        )).scalar() or 0
        return min(float(count) * 2.0, 10.0)

    elif formula == "nro_violencias":
        count = (await db.execute(
            select(func.count()).where(VulnerabilidadeFamiliar.family_id == family_id)
        )).scalar() or 0
        return min(float(count) * 3.0, 10.0)

    elif formula == "programas_sociais":
        return 5.0 if family_id else 0.0

    elif formula == "nro_atendimentos":
        count = 0
        return min(float(count) * 1.5, 10.0)

    return 0.0


async def recalcular_ivs_tenant(db: AsyncSession, tenant_id: str) -> int:
    families = (await db.execute(select(Family.id).where(Family.tenant_id == tenant_id, Family.deleted_at.is_(None)))).scalars().all()
    count = 0
    for fid in families:
        try:
            await calcular_ivs_familia(db, str(fid), tenant_id)
            count += 1
        except Exception:
            logger.exception("Erro ao calcular IVS para familia %s", fid)
    logger.info("IVS recalculado para %d familias do tenant %s", count, tenant_id)
    return count
