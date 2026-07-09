import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.beneficio import ConcessaoBeneficio  # noqa: F401
from app.models.domain import BenefitType
from app.models.enums import UnitType
from app.models.family import Family
from app.models.importacao import ImportJob
from app.models.organization import Organization
from app.models.professional import Professional
from app.models.unit import Unit


async def get_tenant_setup_status(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    org = await db.get(Organization, tenant_id)
    tenant_name = org.name if org else str(tenant_id)

    units_count = (
        await db.execute(
            select(func.count(Unit.id)).where(
                Unit.tenant_id == tenant_id, Unit.deleted_at.is_(None)
            )
        )
    ).scalar() or 0

    benefit_types_count = (
        await db.execute(
            select(func.count(BenefitType.id)).where(
                BenefitType.tenant_id == tenant_id, BenefitType.ativo.is_(True)
            )
        )
    ).scalar() or 0

    professionals_count = (
        await db.execute(
            select(func.count(Professional.id)).where(
                Professional.tenant_id == tenant_id,
                Professional.is_active.is_(True),
            )
        )
    ).scalar() or 0

    territories_count = (
        await db.execute(
            select(func.count(Family.territorio.distinct())).where(
                Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
                Family.territorio.isnot(None),
            )
        )
    ).scalar() or 0

    imports_count = (
        await db.execute(
            select(func.count(ImportJob.id)).where(
                ImportJob.tenant_id == tenant_id
            )
        )
    ).scalar() or 0

    steps = [
        {"step": "units", "completed": units_count > 0},
        {"step": "territories", "completed": territories_count > 0},
        {"step": "benefits", "completed": benefit_types_count > 0},
        {"step": "professionals", "completed": professionals_count > 0},
        {"step": "import", "completed": imports_count > 0},
    ]

    ready = all(s["completed"] for s in steps)

    return {
        "tenant_id": tenant_id,
        "tenant_name": tenant_name,
        "steps": steps,
        "ready": ready,
    }


async def execute_wizard_setup(
    db: AsyncSession, tenant_id: uuid.UUID, step: str, data: dict
) -> dict:
    from app.core.seeds import seed_national_domains

    if step == "units":
        unidades = data.get("unidades", [])
        created = 0
        for u in unidades:
            unit = Unit(
                tenant_id=tenant_id,
                tipo=u.get("tipo", UnitType.CRAS.value),
                nome=u["nome"],
                bairro=u.get("bairro"),
                municipio=u.get("municipio"),
                uf=u.get("uf"),
                territorios=u.get("territorios"),
                is_active=True,
            )
            db.add(unit)
            created += 1
        await db.flush()
        return {"step": "units", "created": created}

    if step == "territories":
        nome = data.get("nome")
        unidades = data.get("unidades", [])
        if nome and unidades:
            for uid in unidades:
                unit = (
                    await db.execute(
                        select(Unit).where(
                            Unit.tenant_id == tenant_id,
                            Unit.id == uuid.UUID(uid),
                        )
                    )
                ).scalar_one_or_none()
                if unit:
                    current = unit.territorios or []
                    if nome not in current:
                        current.append(nome)
                    unit.territorios = current
            await db.flush()
        return {"step": "territories", "added": nome}

    if step == "benefits":
        counts = await seed_national_domains(db, tenant_id)
        return {"step": "benefits", "seeded": counts}

    if step == "professionals":
        profs = data.get("professionals", [])
        created = 0
        for p in profs:
            prof = Professional(
                tenant_id=tenant_id,
                nome=p["nome"],
                cpf=p.get("cpf"),
                funcao_nob_rh=p.get("funcao"),
                email=p.get("email"),
                telefone=p.get("telefone"),
                is_active=True,
            )
            db.add(prof)
            created += 1
        await db.flush()
        return {"step": "professionals", "created": created}

    if step == "import":
        return {"step": "import", "redirect": "/api/v1/importacao/cadunico"}

    return {"step": step, "status": "unknown_step"}
