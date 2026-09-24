import uuid
import re
from typing import Annotated
from urllib.parse import urlparse

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.config import settings
from app.models.organization import Organization
from app.models.tenant_domain import TenantDomain


_RESERVED_OFFICIAL_HOSTS = {"www", "api", "admin", "doe-admin", "diario"}


def _normalized_host(host: str) -> str:
    return host.split(":")[0].strip().lower().rstrip(".")


def _is_shared_or_internal_host(host: str) -> bool:
    domain = _normalized_host(host)
    if domain in {"api", "localhost", "127.0.0.1"}:
        return True
    base_domain = settings.TENANT_BASE_DOMAIN.strip().strip(".").lower()
    if not base_domain:
        return False
    if domain == base_domain:
        return True
    suffix = f".{base_domain}"
    return domain.endswith(suffix) and domain.removesuffix(suffix) in _RESERVED_OFFICIAL_HOSTS


def _candidate_slug_from_host(host: str) -> str | None:
    domain = _normalized_host(host)
    if not domain or domain in ("localhost", "127.0.0.1"):
        return None
    base_domain = settings.TENANT_BASE_DOMAIN.strip().strip(".").lower()
    suffix = f".{base_domain}"
    if not base_domain or not domain.endswith(suffix):
        return None
    subdomain = domain.removesuffix(suffix)
    if subdomain in _RESERVED_OFFICIAL_HOSTS:
        return None
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,62}", subdomain):
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

    if domain and domain not in ("localhost", "127.0.0.1"):
        result = await db.execute(
            select(TenantDomain).where(
                TenantDomain.domain == domain,
                TenantDomain.is_active == True,
            )
        )
        td = result.scalar_one_or_none()
        if td is not None:
            result = await db.execute(
                select(Organization).where(
                    Organization.id == td.organization_id,
                    Organization.is_active.is_(True),
                )
            )
            org = result.scalar_one_or_none()
            if org is not None:
                return org

    if not _is_shared_or_internal_host(domain):
        return None

    for source in (origin, referer):
        if not source:
            continue
        parsed = urlparse(source)
        if (
            parsed.scheme not in {"http", "https"}
            or parsed.username is not None
            or parsed.password is not None
        ):
            continue
        source_domain = (parsed.hostname or "").lower().rstrip(".")
        candidate = _candidate_slug_from_host(source_domain)
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

        if source_domain and source_domain not in {"localhost", "127.0.0.1"}:
            result = await db.execute(
                select(TenantDomain).where(
                    TenantDomain.domain == source_domain,
                    TenantDomain.is_active == True,
                )
            )
            td = result.scalar_one_or_none()
            if td is not None:
                result = await db.execute(
                    select(Organization).where(
                        Organization.id == td.organization_id,
                        Organization.is_active.is_(True),
                    )
                )
                org = result.scalar_one_or_none()
                if org is not None:
                    return org

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
