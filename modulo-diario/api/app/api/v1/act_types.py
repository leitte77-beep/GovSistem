import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, get_current_user, require_roles
from app.core.database import get_db
from app.models.act_type import ActType

router = APIRouter(prefix="/act-types", tags=["act-types"])


@router.get("")
async def list_act_types(
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ActType).where(ActType.organization_id == current.organization_id)
    )
    return result.scalars().all()


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_act_type(
    name: str = Query(...),
    slug: str = Query(...),
    description: str | None = Query(None),
    requires_org_unit: bool = Query(False),
    current: CurrentUser = Depends(require_roles("ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(ActType).where(ActType.organization_id == current.organization_id, ActType.slug == slug)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Act type slug already exists")

    act_type = ActType(
        organization_id=current.organization_id, name=name, slug=slug,
        description=description, requires_org_unit=requires_org_unit,
    )
    db.add(act_type)
    await db.commit()
    await db.refresh(act_type)
    return act_type


@router.put("/{act_type_id}")
async def update_act_type(
    act_type_id: uuid.UUID,
    name: str | None = Query(None),
    slug: str | None = Query(None),
    description: str | None = Query(None),
    requires_org_unit: bool | None = Query(None),
    current: CurrentUser = Depends(require_roles("ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ActType).where(ActType.id == act_type_id, ActType.organization_id == current.organization_id)
    )
    act_type = result.scalar_one_or_none()
    if not act_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Act type not found")
    if name is not None: act_type.name = name
    if slug is not None: act_type.slug = slug
    if description is not None: act_type.description = description
    if requires_org_unit is not None: act_type.requires_org_unit = requires_org_unit
    await db.commit()
    await db.refresh(act_type)
    return act_type


@router.delete("/{act_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_act_type(
    act_type_id: uuid.UUID,
    current: CurrentUser = Depends(require_roles("ADMIN", "PLATFORM_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ActType).where(ActType.id == act_type_id, ActType.organization_id == current.organization_id)
    )
    act_type = result.scalar_one_or_none()
    if not act_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Act type not found")
    await db.delete(act_type)
    await db.commit()
