import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, get_current_user, require_roles
from app.core.database import get_db
from app.models.org_unit import OrgUnit

router = APIRouter(prefix="/org-units", tags=["org-units"])


@router.get("")
async def list_org_units(
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OrgUnit).where(OrgUnit.organization_id == current.organization_id)
    )
    return result.scalars().all()


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_org_unit(
    name: str = Query(...),
    slug: str = Query(...),
    parent_id: uuid.UUID | None = Query(None),
    description: str | None = Query(None),
    current: CurrentUser = Depends(require_roles("ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    unit = OrgUnit(
        organization_id=current.organization_id, name=name, slug=slug,
        parent_id=parent_id, description=description,
    )
    db.add(unit)
    await db.commit()
    await db.refresh(unit)
    return unit


@router.put("/{unit_id}")
async def update_org_unit(
    unit_id: uuid.UUID,
    name: str | None = Query(None),
    slug: str | None = Query(None),
    parent_id: uuid.UUID | None = Query(None),
    description: str | None = Query(None),
    current: CurrentUser = Depends(require_roles("ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OrgUnit).where(OrgUnit.id == unit_id, OrgUnit.organization_id == current.organization_id)
    )
    unit = result.scalar_one_or_none()
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Org unit not found")
    if name is not None: unit.name = name
    if slug is not None: unit.slug = slug
    if parent_id is not None: unit.parent_id = parent_id
    if description is not None: unit.description = description
    await db.commit()
    await db.refresh(unit)
    return unit


@router.delete("/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_org_unit(
    unit_id: uuid.UUID,
    current: CurrentUser = Depends(require_roles("ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OrgUnit).where(OrgUnit.id == unit_id, OrgUnit.organization_id == current.organization_id)
    )
    unit = result.scalar_one_or_none()
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Org unit not found")
    await db.delete(unit)
    await db.commit()
