from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import escopo_unidades, get_current_user, get_user_permissions, perfis_efetivos
from app.core.permissions import PERFIS_ATRIBUIVEIS
from app.models.unidade import Unidade
from app.core.database import get_db
from app.models.auth_models import Organization, User

router = APIRouter(tags=["auth"])


@router.get("/auth/me")
async def me(
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "organization_id": str(user.organization_id),
        "organization_name": (
            await db.scalar(
                select(Organization.name).where(Organization.id == user.organization_id)
            )
            if user.organization_id
            else None
        ),
        "roles": [
            {"id": str(ur.role.id), "name": ur.role.name, "label": ur.role.label}
            for ur in user.user_roles
        ],
        "permissions": sorted(get_user_permissions(user)),
        # Perfil efetivo (o definido no GovFrota prevalece sobre a plataforma).
        "perfis": [
            {"name": p, "label": PERFIS_ATRIBUIVEIS.get(p, p.replace("_", " ").title())}
            for p in sorted(perfis_efetivos(user))
        ],
        "cargo": user.cargo_local,
        # Escopo por secretaria: null = todas; lista (pode ser vazia) = restrito.
        "secretarias": await _secretarias(db, user),
    }


async def _secretarias(db: AsyncSession, user: User) -> list[dict] | None:
    escopo = escopo_unidades(user)
    if escopo is None:
        return None
    if not escopo:
        return []
    linhas = (
        await db.execute(
            select(Unidade.id, Unidade.nome, Unidade.sigla)
            .where(Unidade.id.in_(escopo), Unidade.organization_id == user.organization_id)
            .order_by(Unidade.nome)
        )
    ).all()
    return [{"id": str(i), "nome": n, "sigla": s} for i, n, s in linhas]
