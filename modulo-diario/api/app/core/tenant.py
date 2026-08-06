import uuid
from typing import Annotated
from urllib.parse import urlparse

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.organization import Organization
from app.models.tenant_domain import TenantDomain


def _candidate_slug_from_host(host: str) -> str | None:
    domain = host.split(":")[0].lower()
    if not domain or domain in ("localhost", "127.0.0.1"):
        return None
    parts = domain.split(".")
    if len(parts) < 3:
        return None
    subdomain = parts[0]
    if subdomain in {"www", "api", "admin", "doe-admin", "diario"}:
        return None
    if not subdomain or not subdomain[0].isalnum():
        return None
    if not all(ch.isalnum() or ch == "-" for ch in subdomain):
        return None
    return subdomain


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
    origin = request.headers.get("origin", "").strip()
    referer = request.headers.get("referer", "").strip()

    for source in (origin, referer):
        if not source:
            continue
        parsed = urlparse(source)
        candidate = _candidate_slug_from_host(parsed.netloc or parsed.hostname or "")
        if candidate:
            result = await db.execute(
                select(Organization).where(
                    Organization.slug == candidate,
                    Organization.is_active.is_(True),
                )
            )
            org = result.scalar_one_or_none()
            if org is not None:
                return org

    candidate = _candidate_slug_from_host(domain)
    if candidate:
        result = await db.execute(
            select(Organization).where(
                Organization.slug == candidate,
                Organization.is_active.is_(True),
            )
        )
        org = result.scalar_one_or_none()
        if org is not None:
            return org

    if not domain or domain in ("localhost", "127.0.0.1"):
        return None

    result = await db.execute(
        select(TenantDomain)
        .where(TenantDomain.domain == domain, TenantDomain.is_active == True)
    )
    td = result.scalar_one_or_none()
    if td is not None:
        result = await db.execute(
            select(Organization).where(
                Organization.id == td.organization_id,
                Organization.is_active.is_(True),
            )
        )
        return result.scalar_one_or_none()

    if tenant_slug:
        origin_slug = None
        for source in (origin, referer):
            if not source:
                continue
            parsed = urlparse(source)
            origin_slug = _candidate_slug_from_host(parsed.netloc or parsed.hostname or "")
            if origin_slug:
                break
        if origin_slug and origin_slug != tenant_slug:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="X-Tenant-Slug does not match request origin",
            )
        result = await db.execute(
            select(Organization).where(
                Organization.slug == tenant_slug,
                Organization.is_active.is_(True),
            )
        )
        return result.scalar_one_or_none()

    return None


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
