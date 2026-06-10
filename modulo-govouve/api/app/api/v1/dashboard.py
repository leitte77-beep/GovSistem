"""Dashboard endpoint for GovOuve."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.models.secretaria import Secretaria

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def user_has_role(user: User, role_name: str) -> bool:
    return any(ur.role.name == role_name for ur in (user.user_roles or []) if ur.role)


@router.get("")
async def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user.organization_id

    total_secretarias = await db.execute(
        select(func.count(Secretaria.id)).where(
            Secretaria.tenant_id == org_id,
            Secretaria.deleted_at.is_(None),
        )
    )
    ativas = await db.execute(
        select(func.count(Secretaria.id)).where(
            Secretaria.tenant_id == org_id,
            Secretaria.ativo.is_(True),
            Secretaria.deleted_at.is_(None),
        )
    )

    is_admin = user_has_role(current_user, "ADMIN") or user_has_role(
        current_user, "OUVIDOR_GERAL"
    )

    return {
        "total_secretarias": total_secretarias.scalar() or 0,
        "secretarias_ativas": ativas.scalar() or 0,
        "manifestacoes_abertas": 0,
        "manifestacoes_vencidas": 0,
        "avaliacoes_coletadas": 0,
        "is_admin": is_admin,
    }
