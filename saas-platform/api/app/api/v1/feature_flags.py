import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, get_current_platform_admin
from app.core.database import get_db
from app.models.feature_flag import FeatureFlag
from app.models.user import User

router = APIRouter(prefix="/feature-flags", tags=["feature-flags"])


class FeatureFlagCreate(BaseModel):
    key: str
    name: str
    description: Optional[str] = None
    enabled: bool = False
    company_id: Optional[uuid.UUID] = None


class FeatureFlagUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None


class FeatureFlagResponse(BaseModel):
    id: uuid.UUID
    key: str
    name: str
    description: Optional[str] = None
    enabled: bool
    company_id: Optional[uuid.UUID] = None
    enabled_at: Optional[str] = None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[FeatureFlagResponse])
async def list_feature_flags(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    result = await db.execute(select(FeatureFlag).order_by(FeatureFlag.key))
    return result.scalars().all()


@router.post("/", response_model=FeatureFlagResponse, status_code=201)
async def create_feature_flag(
    data: FeatureFlagCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    existing = await db.execute(
        select(FeatureFlag).where(FeatureFlag.key == data.key)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Feature flag already exists")
    flag = FeatureFlag(
        key=data.key,
        name=data.name,
        description=data.description,
        enabled=data.enabled,
        company_id=data.company_id,
    )
    db.add(flag)
    await db.commit()
    await db.refresh(flag)
    return flag


@router.patch("/{flag_id}", response_model=FeatureFlagResponse)
async def update_feature_flag(
    flag_id: uuid.UUID,
    data: FeatureFlagUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    result = await db.execute(select(FeatureFlag).where(FeatureFlag.id == flag_id))
    flag = result.scalar_one_or_none()
    if not flag:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    if data.name is not None:
        flag.name = data.name
    if data.description is not None:
        flag.description = data.description
    if data.enabled is not None:
        flag.enabled = data.enabled
    await db.commit()
    await db.refresh(flag)
    return flag


@router.get("/{key}/check")
async def check_feature_flag(
    key: str,
    company_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from app.services.feature_flag import is_feature_enabled

    enabled = await is_feature_enabled(db, key, company_id)
    return {"key": key, "enabled": enabled}
