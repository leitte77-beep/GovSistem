"""Calculo de renda e classificacao socioeconomica."""
from datetime import date

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family import Family
from app.models.person_family_membership import PersonFamilyMembership
from app.models.socioeconomico import DespesaFamiliar, RendaMembro


FAIXAS_RENDA = {
    "EXTREMA_POBREZA": 109.00,
    "POBREZA": 218.00,
    "BAIXA_RENDA": 706.00,
}


def classificar_renda(renda_per_capita: float) -> str:
    if renda_per_capita <= FAIXAS_RENDA["EXTREMA_POBREZA"]:
        return "EXTREMA_POBREZA"
    elif renda_per_capita <= FAIXAS_RENDA["POBREZA"]:
        return "POBREZA"
    elif renda_per_capita <= FAIXAS_RENDA["BAIXA_RENDA"]:
        return "BAIXA_RENDA"
    return "ACIMA_MEIO_SM"


async def calcular_demonstrativo_renda(
    db: AsyncSession, tenant_id, family_id,
) -> dict:
    """Calcula renda total, per capita, despesas e faixa."""
    rendas = (
        await db.execute(
            select(RendaMembro).where(
                RendaMembro.tenant_id == tenant_id,
                RendaMembro.family_id == family_id,
            )
        )
    ).scalars().all()

    despesas = (
        await db.execute(
            select(DespesaFamiliar).where(
                DespesaFamiliar.tenant_id == tenant_id,
                DespesaFamiliar.family_id == family_id,
            )
        )
    ).scalars().all()

    total_membros = (
        await db.scalar(
            select(func.count(PersonFamilyMembership.id)).where(
                PersonFamilyMembership.tenant_id == tenant_id,
                PersonFamilyMembership.family_id == family_id,
                PersonFamilyMembership.status == "ATIVO",
            )
        )
    ) or 0

    programas = ("BPC", "PBF")
    renda_total = sum(r.valor or 0 for r in rendas)
    renda_sem_programas = sum(r.valor or 0 for r in rendas if r.tipo not in programas)
    renda_com_programas = renda_total

    per_capita = renda_total / total_membros if total_membros > 0 else 0.0
    per_capita_sem = renda_sem_programas / total_membros if total_membros > 0 else 0.0

    total_despesas = sum(d.valor or 0 for d in despesas)
    despesas_per_capita = total_despesas / total_membros if total_membros > 0 else 0.0

    faixa = classificar_renda(per_capita_sem)

    return {
        "family_id": family_id,
        "total_membros": total_membros,
        "renda_familiar_total": renda_com_programas,
        "renda_per_capita": per_capita,
        "renda_com_programas": renda_com_programas,
        "renda_com_programas_per_capita": per_capita,
        "renda_sem_programas": renda_sem_programas,
        "renda_sem_programas_per_capita": per_capita_sem,
        "total_despesas": total_despesas,
        "despesas_per_capita": despesas_per_capita,
        "faixa_renda": faixa,
        "rendas": list(rendas),
        "despesas": list(despesas),
    }


async def atualizar_faixa_renda_familiar(
    db: AsyncSession, tenant_id, family_id,
):
    """Atualiza automaticamente a faixa de renda da family se configurado."""
    demo = await calcular_demonstrativo_renda(db, tenant_id, family_id)
    family = (
        await db.execute(
            select(Family).where(
                Family.tenant_id == tenant_id,
                Family.id == family_id,
            )
        )
    ).scalar_one_or_none()

    if family:
        from app.models.organization import Organization
        org = (
            await db.execute(
                select(Organization).where(Organization.id == tenant_id)
            )
        ).scalar_one_or_none()

        settings = org.settings or {} if org else {}
        auto_faixa = settings.get("controle_automatico_faixa_renda", False)
        if auto_faixa:
            family.faixa_renda = demo["faixa_renda"]
            await db.commit()
