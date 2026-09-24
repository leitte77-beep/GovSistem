"""Legacy URL mapping API (redirects preserve SEO and old public links).

Admin: register a legacy URL → new canonical path. Public: resolve a legacy
path to a permanent redirect (301). Only active maps are honored, scoped to
the tenant, and the redirect target must never point to private resources.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_roles
from app.core.database import get_db
from app.core.tenant import resolve_tenant_from_domain
from app.models.legacy_url_map import LegacyUrlMap
from app.models.organization import Organization
from app.models.user import User

router = APIRouter(tags=["legacy-urls"])


class LegacyUrlMapCreate(BaseModel):
    legacy_url: str
    new_path: str
    entity_type: str | None = None
    entity_id: uuid.UUID | None = None


def _safe_path(path: str) -> str:
    """Sanitize a static/full path; Must start with '/' and not be an admin route."""
    path = path.strip()
    if not path.startswith("/"):
        path = f"/{path}"
    if path.startswith(("/api", "/admin", "/settings")):
        raise HTTPException(422, "new_path não pode apontar para recursos privados.")
    return path


@router.post("/legacy-urls", status_code=201)
async def register_legacy_url(
    body: LegacyUrlMapCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "SUPER_ADMIN")),
):
    new_path = _safe_path(body.new_path)
    existing = (
        await db.execute(
            select(LegacyUrlMap).where(LegacyUrlMap.legacy_url == body.legacy_url.strip())
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "legacy_url já mapeada.")

    mapping = LegacyUrlMap(
        organization_id=user.organization_id,
        legacy_url=body.legacy_url.strip(),
        new_path=new_path,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        status="active",
    )
    db.add(mapping)
    await db.commit()
    await db.refresh(mapping)
    return {
        "id": str(mapping.id),
        "legacy_url": mapping.legacy_url,
        "new_path": mapping.new_path,
        "status": mapping.status,
    }


@router.get("/legacy-urls/resolve", include_in_schema=False)
async def resolve_legacy(
    path: str = Query(...),
    db: AsyncSession = Depends(get_db),
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
):
    if tenant is None:
        raise HTTPException(404, "Not found")
    mapping = (
        await db.execute(
            select(LegacyUrlMap).where(
                LegacyUrlMap.legacy_url == path,
                LegacyUrlMap.organization_id == tenant.id,
                LegacyUrlMap.status == "active",
            )
        )
    ).scalar_one_or_none()
    if mapping is None:
        raise HTTPException(404, "Not found")
    return {"target": mapping.new_path}


@router.get("/go/{path:path}", include_in_schema=False)
async def legacy_redirect(
    path: str,
    db: AsyncSession = Depends(get_db),
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
):
    """Resolve a legacy path and redirect with a permanent 301."""
    if tenant is None:
        raise HTTPException(404, "Not found")
    mapping = (
        await db.execute(
            select(LegacyUrlMap).where(
                LegacyUrlMap.legacy_url == path,
                LegacyUrlMap.organization_id == tenant.id,
                LegacyUrlMap.status == "active",
            )
        )
    ).scalar_one_or_none()
    if mapping is None:
        raise HTTPException(404, "Not found")
    return RedirectResponse(url=mapping.new_path, status_code=301)
