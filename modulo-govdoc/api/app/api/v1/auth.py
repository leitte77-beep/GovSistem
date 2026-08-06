"""Autenticação: dados do usuário autenticado e ponte de sessão de desenvolvimento.

O login é feito na plataforma SaaS (GovSistem) — o GovDoc não emite mais senha
nem mantém sessão própria. A ponte `/auth/dev/session` existe apenas em
desenvolvimento para validar a identidade no SaaS e abrir uma sessão local.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.enums import Permission, Profile
from app.models.organization import Institution
from app.models.user import User
from app.schemas.auth import MeResponse, UserOut
from app.services.permissions import (
    ALL_PERMISSIONS,
    AUDITOR,
    CONTRIBUTOR,
    MANAGER,
    SECRETARIAT_ADMIN,
    _profile_baseline,  # noqa: F401
)

router = APIRouter(prefix="/auth", tags=["Autenticação"])


@router.get("/eu", response_model=MeResponse, summary="Dados do usuário autenticado")
async def me(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> MeResponse:
    institution = await db.get(Institution, user.institution_id)

    baseline = {
        Profile.ADMIN_GERAL.value: ALL_PERMISSIONS,
        Profile.ADMIN_SECRETARIA.value: SECRETARIAT_ADMIN,
        Profile.GESTOR_SETOR.value: MANAGER,
        Profile.COLABORADOR.value: CONTRIBUTOR,
        Profile.LEITOR.value: {
            Permission.VIEW.value,
            Permission.VIEW_METADATA.value,
            Permission.DOWNLOAD.value,
        },
        Profile.AUDITOR.value: AUDITOR,
    }.get(user.profile, set())

    return MeResponse(
        usuario=UserOut.build(user),
        instituicao={
            "id": str(institution.id) if institution else None,
            "nome": institution.name if institution else "",
            "cor_primaria": institution.primary_color if institution else "#1e40af",
            "cor_destaque": institution.accent_color if institution else "#facc15",
        },
        permissoes_globais=sorted(baseline),
    )
