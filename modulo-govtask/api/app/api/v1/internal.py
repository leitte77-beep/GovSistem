"""Internal endpoints for SaaS platform sync (user/org provisioning)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_internal_key
from app.core.database import get_db
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
    request: Request,
    _: None = Depends(require_internal_key),
    db: AsyncSession = Depends(get_db),
):
    """Sync (upsert) organization from SaaS platform."""
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

    await db.commit()
    await db.refresh(org)
    return {"organization_id": str(org.id), "slug": org.slug}


@router.post("/internal/sync-user")
async def sync_user(
    body: SyncUserRequest,
    request: Request,
    _: None = Depends(require_internal_key),
    db: AsyncSession = Depends(get_db),
):
    """Sync (upsert) user from SaaS platform."""
    result = await db.execute(
        select(User).where(User.email == body.email)
    )
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
            password_hash=None,  # SSO-managed user, no local password
        )
        db.add(user)

    await db.flush()

    # Sync roles
    if body.roles:
        # Remove existing roles
        existing_roles = await db.execute(
            select(UserRole).where(UserRole.user_id == user.id)
        )
        for ur in existing_roles.scalars().all():
            await db.delete(ur)

        # Assign new roles
        for role_name in body.roles:
            # Map SaaS roles to GovTask roles
            govtask_role = _map_role(role_name)
            if govtask_role:
                role_result = await db.execute(
                    select(Role).where(Role.name == govtask_role)
                )
                role = role_result.scalar_one_or_none()
                if role:
                    db.add(UserRole(user_id=user.id, role_id=role.id))

    await db.commit()
    await db.refresh(user)
    return {"user_id": str(user.id), "email": user.email}


def _map_role(saas_role: str) -> str | None:
    """Map SaaS platform roles to GovTask local roles."""
    mapping = {
        "PLATFORM_ADMIN": "ADMIN",
        "ADMIN": "ADMIN",
        "ASSESSOR": "ASSESSOR",
        "ENGENHEIRO_TECNICO": "ENGENHEIRO_TECNICO",
        "COMPRAS_LICITACAO": "COMPRAS_LICITACAO",
        "GESTOR": "GESTOR",
        "ORG_MEMBER": "GESTOR",  # Default read-only access
    }
    return mapping.get(saas_role)
