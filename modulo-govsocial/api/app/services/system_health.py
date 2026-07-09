from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.attendance import Attendance
from app.models.family import Family
from app.models.organization import Organization
from app.models.rma import RmaFechamento
from app.models.user import User


def _dt(d: date) -> datetime:
    return datetime(d.year, d.month, 1, tzinfo=timezone.utc)


async def get_system_health(db: AsyncSession) -> dict:
    hoje = date.today()
    inicio_mes = date(hoje.year, hoje.month, 1)

    tenants_ativos = (
        await db.execute(
            select(func.count(Organization.id)).where(
                Organization.is_active.is_(True)
            )
        )
    ).scalar() or 0

    total_familias = (
        await db.execute(
            select(func.count(Family.id)).where(
                Family.deleted_at.is_(None)
            )
        )
    ).scalar() or 0

    total_atendimentos_mes = (
        await db.execute(
            select(func.count(Attendance.id)).where(
                Attendance.data_atendimento >= _dt(inicio_mes),
                Attendance.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    ultimo_rma = (
        await db.execute(
            select(RmaFechamento.fechado_em).where(
                RmaFechamento.status == "FECHADO"
            ).order_by(RmaFechamento.fechado_em.desc()).limit(1)
        )
    ).scalar_one_or_none()

    status = "healthy" if tenants_ativos > 0 else "degraded"

    return {
        "status": status,
        "version": settings.VERSION,
        "tenants_ativos": int(tenants_ativos),
        "total_familias": int(total_familias),
        "total_atendimentos_mes": int(total_atendimentos_mes),
        "ultimo_rma_fechado": ultimo_rma.isoformat() if ultimo_rma else None,
    }


async def get_system_metrics(db: AsyncSession) -> dict:
    hoje = date.today()
    inicio_mes = date(hoje.year, hoje.month, 1)

    tenants_ativos = (
        await db.execute(
            select(func.count(Organization.id)).where(
                Organization.is_active.is_(True)
            )
        )
    ).scalar() or 0

    total_familias = (
        await db.execute(
            select(func.count(Family.id)).where(
                Family.deleted_at.is_(None)
            )
        )
    ).scalar() or 0

    total_atendimentos_mes = (
        await db.execute(
            select(func.count(Attendance.id)).where(
                Attendance.data_atendimento >= _dt(inicio_mes),
                Attendance.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    total_usuarios = (
        await db.execute(
            select(func.count(User.id)).where(User.is_active.is_(True))
        )
    ).scalar() or 0

    ultimo_rma = (
        await db.execute(
            select(RmaFechamento.fechado_em).where(
                RmaFechamento.status == "FECHADO"
            ).order_by(RmaFechamento.fechado_em.desc()).limit(1)
        )
    ).scalar_one_or_none()

    return {
        "tenants_ativos": int(tenants_ativos),
        "total_familias": int(total_familias),
        "total_atendimentos_mes": int(total_atendimentos_mes),
        "total_usuarios": int(total_usuarios),
        "ultimo_rma_fechado": ultimo_rma.isoformat() if ultimo_rma else None,
    }
