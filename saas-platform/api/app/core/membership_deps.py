"""Dependências FastAPI para o contexto multi-tenant (portal app.govsistem.com.br).

O tenant é derivado do token/sessão (membership_id ou active_organization_id),
NUNCA do body/frontend. A verificação de gestor usa o membership do tenant.
O slug da URL (/t/<slug>) NUNCA concede acesso por si; apenas valida o membership.
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_token
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.user import User
from app.services.membership import get_membership


class TenantContext:
    """Contexto resolvido do tenant autenticado."""

    def __init__(
        self,
        user: User,
        organization: Organization,
        membership: OrganizationMembership,
    ) -> None:
        self.user = user
        self.organization = organization
        self.membership = membership

    @property
    def organization_id(self) -> uuid.UUID:
        return self.organization.id

    @property
    def membership_id(self) -> uuid.UUID:
        return self.membership.id

    @property
    def is_manager(self) -> bool:
        return self.membership.membership_role == "ORG_ADMIN"


def _token_payload(request: Request) -> dict:
    """Decodifica o bearer do Authorization para ler claims de tenant/membership."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        try:
            return decode_token(auth[7:].strip())
        except Exception:
            return {}
    return {}


async def resolve_active_membership_from_request(
    request: Request,
    user: User,
    db: AsyncSession,
) -> OrganizationMembership | None:
    """Deriva o membership ativo do usuário a partir do token (multitenant).

    Precedência:
      1) claim `membership_id` do token (modelo novo);
      2) claim `active_organization_id` do token;
      3) fallback legado: membership do `user.organization_id`.
    Retorna None quando não há membership ativo válido.
    """
    payload = _token_payload(request)
    membership_id = payload.get("membership_id")
    if membership_id:
        try:
            m = (
                await db.execute(
                    select(OrganizationMembership).where(
                        OrganizationMembership.id == uuid.UUID(str(membership_id)),
                        OrganizationMembership.user_id == user.id,
                        OrganizationMembership.deleted_at.is_(None),
                    )
                )
            ).scalar_one_or_none()
        except Exception:
            m = None
        if m and m.is_active and m.status == "active":
            return m

    org_id = payload.get("active_organization_id")
    if org_id:
        try:
            m = await get_membership(db, user.id, uuid.UUID(str(org_id)))
        except Exception:
            m = None
        if m and m.is_active and m.status == "active":
            return m

    # fallback legado (single-org)
    if user.organization_id:
        m = await get_membership(db, user.id, user.organization_id)
        if m and m.is_active and m.status == "active":
            return m
    return None


async def get_tenant_context(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantContext:
    """Resolve o tenant ativo do usuário autenticado.

    Ordem de precedência:
      1) claim `membership_id` do token (modelo novo);
      2) claim `active_organization_id` / `organization_id` do token (legado);
      3) slug de tenant em /t/<slug> ou header x-tenant-org (só valida o membership).
    """
    payload = _token_payload(request)

    target_slug = None
    path = request.url.path
    if "/t/" in path:
        slug = path.split("/t/")[-1].split("/")[0]
        if slug:
            target_slug = slug
    if not target_slug:
        target_slug = request.headers.get("x-tenant-org")

    membership_id = payload.get("membership_id")
    org_id = payload.get("active_organization_id") or payload.get("organization_id")

    # 1) membership explícito do token
    if membership_id:
        try:
            m = (
                await db.execute(
                    select(OrganizationMembership).where(
                        OrganizationMembership.id == uuid.UUID(str(membership_id)),
                        OrganizationMembership.user_id == user.id,
                        OrganizationMembership.deleted_at.is_(None),
                    )
                )
            ).scalar_one_or_none()
        except Exception:
            m = None
        if m and m.is_active and m.status == "active":
            org = (
                await db.execute(
                    select(Organization).where(
                        Organization.id == m.organization_id,
                        Organization.deleted_at.is_(None),
                        Organization.is_active.is_(True),
                    )
                )
            ).scalar_one_or_none()
            if org:
                if target_slug and target_slug != org.slug:
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
                return TenantContext(user, org, m)

    # 2) fallback legado: organization_id do token
    if org_id:
        try:
            org_uuid = uuid.UUID(str(org_id))
        except Exception:
            org_uuid = None
        if org_uuid:
            m = await get_membership(db, user.id, org_uuid)
            org = (
                await db.execute(
                    select(Organization).where(Organization.id == org_uuid, Organization.deleted_at.is_(None))
                )
            ).scalar_one_or_none()
            if m and org and org.is_active and m.is_active and m.status == "active":
                if target_slug and target_slug != org.slug:
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
                return TenantContext(user, org, m)
            # compat: sem membership, deriva do users.organization_id (virtual, não persiste)
            if not m and org and org.is_active and user.organization_id == org_uuid:
                pseudo = OrganizationMembership(
                    organization_id=org_uuid,
                    user_id=user.id,
                    membership_role="ORG_ADMIN" if user.is_organization_admin else "ORG_MEMBER",
                    status="active" if user.is_active else "inactive",
                    is_active=user.is_active,
                )
                pseudo.id = uuid.uuid4()
                return TenantContext(user, org, pseudo)

    # 3) slug/header sem contexto no token
    if target_slug:
        org = (
            await db.execute(
                select(Organization).where(
                    Organization.slug == target_slug,
                    Organization.deleted_at.is_(None),
                    Organization.is_active.is_(True),
                )
            )
        ).scalar_one_or_none()
        if org:
            m = await get_membership(db, user.id, org.id)
            if m and m.is_active and m.status == "active":
                return TenantContext(user, org, m)

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No active membership for tenant",
    )


async def require_tenant_manager(ctx: TenantContext = Depends(get_tenant_context)) -> TenantContext:
    if not ctx.is_manager:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant manager access required",
        )
    return ctx
