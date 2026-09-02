import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models.act_type import ActType
from app.models.user import User
from app.schemas.act_type import ActTypeCreate, ActTypeUpdate

router = APIRouter(tags=["act-types"])


class ActTypeOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    config: dict | None = None

    model_config = ConfigDict(from_attributes=True)


class ActTypeAdminOut(ActTypeOut):
    is_active: bool = True
    # Number of published/approved matters may be large; omit for the list view.


@router.get("/act-types", response_model=list[ActTypeOut])
async def list_act_types(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ActType)
        .where(ActType.is_active.is_(True), ActType.deleted_at.is_(None))
        .order_by(ActType.name)
    )
    return result.scalars().all()


# ── Admin (friendly config, validated server-side; no raw JSON for the user) ─


@router.get("/admin/act-types", response_model=list[ActTypeAdminOut])
async def admin_list_act_types(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("ADMIN", "SUPER_ADMIN")),
):
    q = select(ActType).where(ActType.deleted_at.is_(None))
    if not include_inactive:
        q = q.where(ActType.is_active.is_(True))
    q = q.order_by(ActType.name)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/admin/act-types", response_model=ActTypeAdminOut, status_code=201)
async def admin_create_act_type(
    body: ActTypeCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("ADMIN", "SUPER_ADMIN")),
):
    existing = await db.execute(
        select(ActType).where(
            ActType.name == body.name.strip(), ActType.deleted_at.is_(None)
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(409, f"ActType '{body.name}' already exists")

    at = ActType(
        name=body.name.strip(),
        description=body.description,
        is_active=True if body.is_active is None else body.is_active,
        config=body.config,
    )
    db.add(at)
    await db.commit()
    await db.refresh(at)
    return at


@router.patch("/admin/act-types/{act_type_id}", response_model=ActTypeAdminOut)
async def admin_update_act_type(
    act_type_id: uuid.UUID,
    body: ActTypeUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("ADMIN", "SUPER_ADMIN")),
):
    result = await db.execute(
        select(ActType).where(ActType.id == act_type_id)
    )
    at = result.scalar_one_or_none()
    if at is None:
        raise HTTPException(404, "ActType not found")

    if body.name is not None:
        name = body.name.strip()
        dup = await db.execute(
            select(ActType).where(
                ActType.name == name,
                ActType.deleted_at.is_(None),
                ActType.id != act_type_id,
            )
        )
        if dup.scalar_one_or_none() is not None:
            raise HTTPException(409, f"ActType '{name}' already exists")
        at.name = name
    if body.description is not None:
        at.description = body.description
    if body.is_active is not None:
        at.is_active = body.is_active
    if body.config is not None:
        at.config = body.config  # already normalized+validated by schema validator

    await db.commit()
    await db.refresh(at)
    return at


@router.delete("/admin/act-types/{act_type_id}", status_code=204)
async def admin_delete_act_type(
    act_type_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("ADMIN", "SUPER_ADMIN")),
):
    from datetime import datetime, timezone

    result = await db.execute(
        select(ActType).where(ActType.id == act_type_id)
    )
    at = result.scalar_one_or_none()
    if at is None:
        raise HTTPException(404, "ActType not found")
    # Soft delete only; matters reference act_types with RESTRICT.
    at.is_active = False
    at.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
