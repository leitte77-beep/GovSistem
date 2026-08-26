"""Endpoints internos para sincronização com a plataforma SaaS."""

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_internal_key
from app.core.database import get_db
from app.models.auth_models import Organization, Role, User, UserRole
from app.models.configuracoes import ConfiguracaoGovFrota

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


# Mapeamento de roles do SaaS para roles do GovFrota
ROLE_MAP = {
    "PLATFORM_ADMIN": "ADMIN",
    "ADMIN": "ADMIN",
    "GOVFROTA_ADMIN": "ADMIN",
    "GOVFROTA_GESTOR_FROTA": "GESTOR_FROTA",
    "GESTOR_FROTA": "GESTOR_FROTA",
    "RESP_COMBUSTIVEL": "RESP_COMBUSTIVEL",
    "GOVFROTA_RESP_COMBUSTIVEL": "RESP_COMBUSTIVEL",
    "RESP_MANUTENCAO": "RESP_MANUTENCAO",
    "GOVFROTA_RESP_MANUTENCAO": "RESP_MANUTENCAO",
    "CONSULTA": "CONSULTA",
    "AUDITOR": "AUDITOR",
    "ORG_MEMBER": "CONSULTA",
}


@router.post("/internal/sync-organization")
async def sync_organization(
    body: SyncOrganizationRequest,
    _: None = Depends(require_internal_key),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Organization).where(Organization.slug == body.slug)
    )
    org = result.scalar_one_or_none()
    if org:
        org.name = body.name
        org.cnpj = body.cnpj
        org.description = body.description
        org.logo_url = body.logo_url
        org.public_url = body.public_url
        org.is_active = body.is_active
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

    # Garante configurações padrão do módulo para o tenant
    config_result = await db.execute(
        select(ConfiguracaoGovFrota).where(
            ConfiguracaoGovFrota.organization_id == org.id
        )
    )
    if config_result.scalar_one_or_none() is None:
        db.add(ConfiguracaoGovFrota(organization_id=org.id))

    # Garante roles do sistema no banco do módulo
    from app.core.permissions import ROLE_DEFAULT_PERMISSIONS

    for role_name in ROLE_DEFAULT_PERMISSIONS:
        role_result = await db.execute(select(Role).where(Role.name == role_name))
        role = role_result.scalar_one_or_none()
        if role is None:
            db.add(Role(name=role_name, label=role_name.replace("_", " ").title(), is_system=True))
    await db.commit()
    return {"organization_id": str(org.id), "slug": org.slug}


@router.post("/internal/sync-user")
async def sync_user(
    body: SyncUserRequest,
    _: None = Depends(require_internal_key),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user:
        user.name = body.name
        user.is_active = body.is_active
        if body.organization_id:
            user.organization_id = uuid.UUID(body.organization_id)
    else:
        user = User(
            id=uuid.UUID(body.user_id),
            organization_id=uuid.UUID(body.organization_id) if body.organization_id else None,
            name=body.name,
            email=body.email,
            is_active=body.is_active,
            password_hash=None,
        )
        db.add(user)
    await db.flush()

    existing_roles = await db.execute(select(UserRole).where(UserRole.user_id == user.id))
    for ur in existing_roles.scalars().all():
        await db.delete(ur)

    for saas_role in body.roles:
        local_role_name = ROLE_MAP.get(saas_role)
        if not local_role_name:
            continue
        role_result = await db.execute(select(Role).where(Role.name == local_role_name))
        role = role_result.scalar_one_or_none()
        if role is None:
            role = Role(name=local_role_name, label=local_role_name.replace("_", " ").title())
            db.add(role)
            await db.flush()
        db.add(UserRole(user_id=user.id, role_id=role.id))

    await db.commit()
    await db.refresh(user)
    return {"user_id": str(user.id), "email": user.email}
