import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.organization import Organization
from app.models.tenant_domain import TenantDomain


async def resolve_tenant_from_domain(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Organization | None:
    """Resolve the tenant organization from the request domain.

    Checks the Host header against tenant_domains table.
    Returns None if no tenant domain matches (global access).
    """
    host = request.headers.get("host", "")
    domain = host.split(":")[0].lower()
    tenant_slug = request.headers.get("x-tenant-slug", "").strip().lower()

    if tenant_slug:
        result = await db.execute(
            select(Organization).where(
                Organization.slug == tenant_slug,
                Organization.is_active == True,
            )
        )
        return result.scalar_one_or_none()

    if not domain or domain in ("localhost", "127.0.0.1"):
        return None

    result = await db.execute(
        select(TenantDomain)
        .where(TenantDomain.domain == domain, TenantDomain.is_active == True)
    )
    td = result.scalar_one_or_none()
    if td is None:
        return None

    result = await db.execute(
        select(Organization).where(
            Organization.id == td.organization_id,
            Organization.is_active == True,
        )
    )
    return result.scalar_one_or_none()


async def require_tenant(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Organization:
    """Require a valid tenant organization for the current request domain.

    Raises 404 if the domain is not associated with an active organization.
    """
    org = await resolve_tenant_from_domain(request, db)
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found for this domain",
        )
    request.state.tenant = org
    return org
