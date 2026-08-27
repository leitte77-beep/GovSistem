"""Serviço de memberships e grants do modelo multi-tenant.

Camada aditiva: novas tabelas são lidas quando as feature flags
correspondentes estão ativas; caso contrário, o comportamento legado é
preservado. Nada é removido.
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.membership_module_grant import MembershipModuleGrant
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.organization_module import OrganizationModule
from app.models.user import User
from app.models.user_module_grant import UserModuleGrant
from app.services.feature_flag import is_feature_enabled

# Mapeamento determinístico seguro para acessos legados por módulo
# (espelha a migration e7f8a9b0c1d2_add_user_module_grants.py).
LEGACY_SAFE_ROLE = {
    "diario": "AUTOR",
    "chatgov": "CHATGOV_USER",
    "financeiro": "FINANCEIRO_VIEWER",
}


async def is_flag(db: AsyncSession, key: str) -> bool:
    """Lê flag do banco; se ausente, usa o default do .env."""
    try:
        return await is_feature_enabled(db, key)
    except Exception:
        return bool(getattr(settings, key, False))


async def get_active_memberships(
    db: AsyncSession, user_id: uuid.UUID
) -> list[OrganizationMembership]:
    return list(
        (
            await db.execute(
                select(OrganizationMembership)
                .join(Organization, Organization.id == OrganizationMembership.organization_id)
                .where(
                    OrganizationMembership.user_id == user_id,
                    OrganizationMembership.deleted_at.is_(None),
                    OrganizationMembership.is_active.is_(True),
                    OrganizationMembership.status == "active",
                    Organization.is_active.is_(True),
                )
            )
        ).scalars().all()
    )


async def get_membership(
    db: AsyncSession, user_id: uuid.UUID, organization_id: uuid.UUID
) -> Optional[OrganizationMembership]:
    return (
        await db.execute(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id == user_id,
                OrganizationMembership.organization_id == organization_id,
                OrganizationMembership.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()


async def get_membership_grants(
    db: AsyncSession,
    membership_id: uuid.UUID,
    module_slug: Optional[str] = None,
) -> list[MembershipModuleGrant]:
    q = select(MembershipModuleGrant).where(
        MembershipModuleGrant.membership_id == membership_id,
        MembershipModuleGrant.deleted_at.is_(None),
        MembershipModuleGrant.is_active.is_(True),
    )
    if module_slug:
        q = q.where(MembershipModuleGrant.module_slug == module_slug)
    return list((await db.execute(q)).scalars().all())


async def is_tenant_manager(db: AsyncSession, user_id: uuid.UUID, organization_id: uuid.UUID) -> bool:
    """Gestor do tenant = membership ORG_ADMIN ativo no tenant."""
    m = await get_membership(db, user_id, organization_id)
    return bool(m and m.membership_role == "ORG_ADMIN" and m.is_active)


async def is_platform_internal(db: AsyncSession, user: User) -> bool:
    """Condição interna inequívoca para admin.govsistem.com.br.

    - SUPER_ADMIN; ou
    - is_platform_admin; ou
    - membership ORG_ADMIN na organização interna da plataforma (slug configurado).
    A label platform_role=SUPPORT NÃO concede acesso ao painel central.
    """
    if user.platform_role == "SUPER_ADMIN" or user.is_platform_admin:
        return True
    internal_org = (
        await db.execute(
            select(Organization.id).where(
                Organization.slug == settings.PLATFORM_INTERNAL_ORG_SLUG,
                Organization.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not internal_org:
        return False
    m = await get_membership(db, user.id, internal_org)
    return bool(m and m.membership_role == "ORG_ADMIN" and m.is_active)


async def resolve_module_roles(
    db: AsyncSession,
    user: User,
    organization_id: uuid.UUID,
    module_slug: str,
) -> tuple[list[str], bool]:
    """Resolve as roles de um usuário no módulo (novo modelo + fallback legado).

    Retorna (roles, usou_fallback_legado).
    """
    roles: list[str] = []
    used_legacy_fallback = False
    grants_v2 = await is_flag(db, "MEMBERSHIP_GRANTS_V2_ENABLED")

    membership = await get_membership(db, user.id, organization_id) if grants_v2 else None
    if membership:
        for g in await get_membership_grants(db, membership.id, module_slug):
            if g.role_name and not g.role_name.startswith("__"):
                roles.append(g.role_name)

    # fallback: user_module_grants (tabela canônica legada)
    if not roles:
        from app.core.roles import normalize_grant_role
        grant_rows = (
            await db.execute(
                select(UserModuleGrant.role_name).where(
                    UserModuleGrant.user_id == user.id,
                    UserModuleGrant.module_slug == module_slug,
                )
            )
        ).all()
        roles = list(dict.fromkeys(normalize_grant_role(module_slug, r) for (r,) in grant_rows))

    # fallback: users.module_permissions (JSON legado)
    legacy_fallback = await is_flag(db, "LEGACY_MODULE_PERMISSIONS_FALLBACK")
    if legacy_fallback and not roles and user.module_permissions:
        legacy_modules = (user.module_permissions or {}).get("modules", []) or []
        if module_slug in legacy_modules:
            safe = LEGACY_SAFE_ROLE.get(module_slug)
            if safe:
                roles.append(safe)
            used_legacy_fallback = True

    return list(dict.fromkeys(roles)), used_legacy_fallback


async def org_has_module(db: AsyncSession, organization_id: uuid.UUID, module_slug: str) -> bool:
    from app.models.module import Module
    om = (
        await db.execute(
            select(OrganizationModule.id)
            .join(Module, Module.id == OrganizationModule.module_id)
            .where(
                OrganizationModule.organization_id == organization_id,
                Module.slug == module_slug,
                Module.is_active.is_(True),
                OrganizationModule.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    return om is not None


def would_remove_last_active_manager(
    active_manager_count: int,
    target_is_active_manager: bool,
    actor_is_target: bool,
    new_role_is_manager: bool = False,
) -> bool:
    """Regra do último gestor: impede rebaixar/remover/suspender/autoexcluir o
    último gestor ativo do órgão.

    Retorna True quando a ação deixaria o órgão sem gestor ativo.
    - active_manager_count: total de gestores ativos (incluindo o alvo).
    - target_is_active_manager: o alvo é um gestor atualmente ativo.
    - actor_is_target: quem executa é o próprio alvo (autoexclusão/auto-rebaixamento).
    - new_role_is_manager: a operação mantém/atribui o papel de gestor (não remove).
    """
    # Se a ação não toca o papel de gestor do alvo, não há risco.
    if not target_is_active_manager or new_role_is_manager:
        return False
    # Remover/rebaixar o único gestor ativo (independente de quem executa) bloqueia.
    if active_manager_count <= 1:
        return True
    # Auto-rebaixamento/autoexclusão bloqueia quando seria o último após a própria saída.
    if actor_is_target and active_manager_count - 1 <= 0:
        return True
    return False
