import uuid

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_internal_key
from app.core.database import get_db
from app.models.organization import Organization
from app.models.user import User

router = APIRouter(prefix="/internal", tags=["internal"])


class OrganizationSyncPayload(BaseModel):
    organization_id: str
    name: str
    slug: str
    cnpj: str | None = None
    description: str | None = None
    logo_url: str | None = None
    public_url: str | None = None
    is_active: bool = True


class UserSyncPayload(BaseModel):
    user_id: str
    organization_id: str
    name: str
    email: str
    is_active: bool = True
    roles: list[str] = Field(default_factory=list)


@router.post("/sync-organization")
async def sync_organization(
    payload: OrganizationSyncPayload,
    _: None = Depends(require_internal_key),
    db: AsyncSession = Depends(get_db),
):
    organization_id = uuid.UUID(payload.organization_id)
    result = await db.execute(
        select(Organization).where(
            or_(Organization.id == organization_id, Organization.slug == payload.slug)
        )
    )
    org = result.scalar_one_or_none()
    if not org:
        org = Organization(
            id=organization_id,
            name=payload.name,
            slug=payload.slug,
            cnpj=payload.cnpj,
            description=payload.description,
            logo_url=payload.logo_url,
            public_url=payload.public_url,
            is_active=payload.is_active,
        )
        db.add(org)
    else:
        org.name = payload.name
        org.slug = payload.slug
        org.cnpj = payload.cnpj
        org.description = payload.description
        org.logo_url = payload.logo_url
        org.public_url = payload.public_url
        org.is_active = payload.is_active
    await db.commit()
    await db.refresh(org)
    return {
        "status": "ok",
        "message": f"Organization {payload.slug} synced",
        "organization_id": str(org.id),
    }


@router.post("/sync-user")
async def sync_user(
    payload: UserSyncPayload,
    _: None = Depends(require_internal_key),
    db: AsyncSession = Depends(get_db),
):
    user_id = uuid.UUID(payload.user_id)
    organization_id = uuid.UUID(payload.organization_id)
    result = await db.execute(
        select(User).where(or_(User.id == user_id, User.email == payload.email))
    )
    user = result.scalar_one_or_none()
    if not user:
        user = User(
            id=user_id,
            organization_id=organization_id,
            name=payload.name,
            email=payload.email,
            is_active=payload.is_active,
        )
        db.add(user)
    else:
        user.organization_id = organization_id
        user.name = payload.name
        user.email = payload.email
        user.is_active = payload.is_active
    await db.commit()
    await db.refresh(user)
    return {
        "status": "ok",
        "message": f"User {payload.email} synced",
        "user_id": str(user.id),
    }
