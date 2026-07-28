"""Regras de escopo por lotação e sigilo de evolução técnica (LGPD/prontuário).

- Técnicos leem prontuários das unidades onde estão lotados (via professionals
  + professional_assignments vinculados ao user).
- Gestor/vigilância veem o TEXTO da evolução apenas se o tenant permitir
  (Organization.settings.gestor_le_evolucao) — sempre auditado no router.
- Sigilo reforçado restringe, dentro da unidade, a quem registrou + coordenador.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import user_role_names
from app.models.enums import RoleName
from app.models.organization import Organization
from app.models.professional import Professional
from app.models.professional_assignment import ProfessionalAssignment
from app.models.user import User

# Perfis com alcance municipal (não limitados por lotação).
_MUNICIPAL_ROLES = {
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
    RoleName.SUPORTE_GOVASSIST.value,
}


async def user_unit_ids(
    db: AsyncSession, tenant_id: uuid.UUID, user: User
) -> set[uuid.UUID]:
    """Unidades onde o usuário está lotado (lotações ativas)."""
    prof = (
        await db.execute(
            select(Professional).where(
                Professional.tenant_id == tenant_id,
                Professional.user_id == user.id,
                Professional.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not prof:
        return set()
    rows = (
        await db.execute(
            select(ProfessionalAssignment.unit_id).where(
                ProfessionalAssignment.tenant_id == tenant_id,
                ProfessionalAssignment.professional_id == prof.id,
                ProfessionalAssignment.data_fim.is_(None),
            )
        )
    ).scalars().all()
    return set(rows)


def has_municipal_scope(user: User) -> bool:
    return bool(user_role_names(user) & _MUNICIPAL_ROLES)


async def can_access_unit(
    db: AsyncSession, tenant_id: uuid.UUID, user: User, unit_id: uuid.UUID
) -> bool:
    if has_municipal_scope(user):
        return True
    return unit_id in await user_unit_ids(db, tenant_id, user)


async def gestor_le_evolucao(db: AsyncSession, tenant_id: uuid.UUID) -> bool:
    org = await db.get(Organization, tenant_id)
    if not org or not org.settings:
        return False
    return bool(org.settings.get("gestor_le_evolucao", False))


async def can_read_evolution(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    attendance_unit_id: uuid.UUID,
    sigiloso_reforcado: bool,
    registrado_por_user_id: uuid.UUID | None,
) -> bool:
    """Decide se o usuário pode ler o TEXTO da evolução de um atendimento."""
    roles = user_role_names(user)

    # Recepção e técnico de nível médio nunca leem evolução.
    if roles & {RoleName.RECEPCAO.value, RoleName.TECNICO_MEDIO.value} and not (
        roles - {RoleName.RECEPCAO.value, RoleName.TECNICO_MEDIO.value}
    ):
        return False

    # Gestor/vigilância: só com parâmetro do tenant habilitado.
    if has_municipal_scope(user):
        if RoleName.ADMIN.value in roles:
            return True
        if roles & {RoleName.GESTOR_MUNICIPAL.value, RoleName.VIGILANCIA.value}:
            return await gestor_le_evolucao(db, tenant_id)
        return True  # suporte (com consentimento tratado no router)

    # Técnicos: precisam estar lotados na unidade do atendimento.
    unit_ids = await user_unit_ids(db, tenant_id, user)
    if attendance_unit_id not in unit_ids:
        return False

    # Sigilo reforçado: só quem registrou ou o coordenador da unidade.
    if sigiloso_reforcado:
        if RoleName.COORDENADOR_UNIDADE.value in roles:
            return True
        return registrado_por_user_id is not None and (
            registrado_por_user_id == user.id
        )

    return True
