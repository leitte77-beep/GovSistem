"""Endpoints internos de provisionamento via plataforma SaaS (SSO).

A plataforma GovSistem chama estes endpoints (protegidos por X-Internal-Key)
antes de emitir o token `module_access`. O contrato é idêntico ao dos demais
módulos (ChatGov/GovSocial): `sync-organization` e `sync-user`.
"""

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_internal_key
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.organization import Organization
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole

router = APIRouter(tags=["internal"])


class SyncOrganizationRequest(BaseModel):
    organization_id: str
    name: str
    slug: str
    cnpj: str | None = None
    description: str | None = None
    logo_url: str | None = None
    public_url: str | None = None
    is_active: bool = True


class SyncUserRequest(BaseModel):
    user_id: str
    organization_id: str
    name: str
    email: str
    is_active: bool = True
    roles: list[str] = []


@router.post("/internal/sync-organization")
async def sync_organization(
    body: SyncOrganizationRequest,
    _: None = Depends(require_internal_key),
    db: AsyncSession = Depends(get_db),
):
    """Cria/atualiza (upsert) o ente vindo da plataforma SaaS."""
    result = await db.execute(select(Organization).where(Organization.slug == body.slug))
    org = result.scalar_one_or_none()

    if org:
        org.name = body.name
        org.cnpj = body.cnpj
        org.description = body.description
        org.logo_url = body.logo_url
        org.public_url = body.public_url
        org.is_active = body.is_active
        if org.deleted_at is not None:
            org.deleted_at = None
    else:
        org = Organization(
            id=uuid.UUID(body.organization_id),
            name=body.name,
            slug=body.slug,
            cnpj=body.cnpj,
            description=body.description,
            logo_url=body.logo_url,
            public_url=body.public_url,
            is_active=body.is_active,
        )
        db.add(org)

    await db.flush()

    # Provisiona os dados de referência (hipóteses legais, plano de classificação,
    # tipos de processo/documento, unidades de exemplo). Idempotente.
    from app.core.seeds import seed_dominio

    await seed_dominio(db, org.id)

    await db.commit()
    await db.refresh(org)
    return {"organization_id": str(org.id), "slug": org.slug}


@router.post("/internal/sync-user")
async def sync_user(
    body: SyncUserRequest,
    _: None = Depends(require_internal_key),
    db: AsyncSession = Depends(get_db),
):
    """Cria/atualiza (upsert) o usuário SSO vindo da plataforma SaaS."""
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()

    org_uuid = uuid.UUID(body.organization_id) if body.organization_id else None

    if user:
        user.name = body.name
        user.is_active = body.is_active
        if org_uuid:
            user.organization_id = org_uuid
        if user.deleted_at is not None:
            user.deleted_at = None
    else:
        user = User(
            id=uuid.UUID(body.user_id),
            organization_id=org_uuid,
            name=body.name,
            email=body.email.lower(),
            is_active=body.is_active,
            password_hash=None,  # gerenciado por SSO, sem senha local
        )
        db.add(user)

    await db.flush()

    mapped_roles = {r for r in (_map_role(name) for name in body.roles) if r is not None}

    existing = await db.execute(select(UserRole).where(UserRole.user_id == user.id))
    current_role_ids = {ur.role_id: ur for ur in existing.scalars().all()}

    if mapped_roles:
        roles_result = await db.execute(select(Role).where(Role.name.in_(mapped_roles)))
        desired_roles = roles_result.scalars().all()
        desired_ids = {r.id for r in desired_roles}

        for role_id, ur in current_role_ids.items():
            if role_id not in desired_ids:
                await db.delete(ur)
        for role in desired_roles:
            if role.id not in current_role_ids:
                db.add(UserRole(user_id=user.id, role_id=role.id))
    else:
        for ur in current_role_ids.values():
            await db.delete(ur)

    await db.commit()
    await db.refresh(user)
    return {"user_id": str(user.id), "email": user.email}


_GOVPRO_ROLE_NAMES = {r.value for r in RoleName}


def _map_role(saas_role: str) -> str | None:
    """Papéis SaaS → perfis GovPro (mesma filosofia do ChatGov, perfis finos).

    - Papéis nativos govpro.* (via UserModuleGrant) passam verbatim.
    - PLATFORM_ADMIN/ADMIN → ADMIN; ORG_MEMBER → SERVIDOR (papel base).
    """
    if saas_role in _GOVPRO_ROLE_NAMES:
        return saas_role
    mapping = {
        "PLATFORM_ADMIN": RoleName.ADMIN.value,
        "ADMIN": RoleName.ADMIN.value,
        "ORG_MEMBER": RoleName.SERVIDOR.value,
    }
    return mapping.get(saas_role)
