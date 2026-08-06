"""Endpoints internos de sincronização com a plataforma SaaS.

Chamados pela plataforma GovSistem no SSO/gestão de órgãos e usuários,
protegidos pela chave interna (`X-Internal-Key`). Mesmo padrão do ChatGov:
`/internal/sync-organization` e `/internal/sync-user` são idempotentes e
apenas refletem no GovDoc o que já é verdade no SaaS — a identidade nunca é
criada aqui.
"""

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_internal_key
from app.core.database import get_db
from app.services.provisioning import (
    ensure_institution_provisioned,
    ensure_user_provisioned,
)

router = APIRouter(prefix="/internal", tags=["Integração interna"])


class SyncOrganizationRequest(BaseModel):
    organization_id: uuid.UUID
    name: str = Field(min_length=1)
    slug: str = Field(default="")
    is_active: bool = True


class SyncUserRequest(BaseModel):
    user_id: uuid.UUID
    organization_id: uuid.UUID
    name: str = Field(min_length=1)
    email: str = Field(default="")
    is_active: bool = True
    roles: list[str] = []


class SyncOrganizationResponse(BaseModel):
    status: str = "ok"
    organization_id: uuid.UUID


class SyncUserResponse(BaseModel):
    status: str = "ok"
    user_id: uuid.UUID


@router.post("/sync-organization", response_model=SyncOrganizationResponse)
async def sync_organization(
    payload: SyncOrganizationRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> SyncOrganizationResponse:
    await ensure_institution_provisioned(
        db,
        organization_id=payload.organization_id,
        name=payload.name,
        slug=payload.slug,
        is_active=payload.is_active,
    )
    await db.commit()
    return SyncOrganizationResponse(organization_id=payload.organization_id)


@router.post("/sync-user", response_model=SyncUserResponse)
async def sync_user(
    payload: SyncUserRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
) -> SyncUserResponse:
    await ensure_user_provisioned(
        db,
        user_id=payload.user_id,
        organization_id=payload.organization_id,
        name=payload.name,
        email=payload.email,
        roles=payload.roles,
        is_active=payload.is_active,
    )
    await db.commit()
    return SyncUserResponse(user_id=payload.user_id)
