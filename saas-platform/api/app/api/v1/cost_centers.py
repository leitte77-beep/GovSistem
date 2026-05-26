import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.cost_center import CostCenter
from app.models.user import User

router = APIRouter(prefix="/cost-centers", tags=["cost-centers"])


class CostCenterResponse(BaseModel):
    id: str
    organization_id: str
    code: str
    name: str
    description: Optional[str] = None
    parent_id: Optional[str] = None
    manager_name: Optional[str] = None
    budget_cents: Optional[int] = None
    is_active: bool

    model_config = {"from_attributes": True}


class CostCenterCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    parent_id: Optional[str] = None
    manager_name: Optional[str] = None
    budget_cents: Optional[int] = None


class CostCenterUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[str] = None
    manager_name: Optional[str] = None
    budget_cents: Optional[int] = None
    is_active: Optional[bool] = None


@router.get("", response_model=list[CostCenterResponse])
async def list_cost_centers(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    query = select(CostCenter)
    if user.organization_id:
        query = query.where(CostCenter.organization_id == user.organization_id)
    result = await db.execute(query.order_by(CostCenter.code))
    return result.scalars().all()


@router.post("", response_model=CostCenterResponse, status_code=201)
async def create_cost_center(
    body: CostCenterCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    if not user.organization_id:
        raise HTTPException(status_code=400, detail="Usuário sem organização")
    cc = CostCenter(
        organization_id=user.organization_id,
        code=body.code,
        name=body.name,
        description=body.description,
        parent_id=body.parent_id,
        manager_name=body.manager_name,
        budget_cents=body.budget_cents,
    )
    db.add(cc)
    await db.commit()
    await db.refresh(cc)
    return cc


@router.put("/{cc_id}", response_model=CostCenterResponse)
async def update_cost_center(
    cc_id: uuid.UUID,
    body: CostCenterUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    result = await db.execute(select(CostCenter).where(CostCenter.id == cc_id))
    cc = result.scalar_one_or_none()
    if not cc:
        raise HTTPException(status_code=404, detail="Centro de custo não encontrado")
    if user.organization_id and cc.organization_id != user.organization_id:
        raise HTTPException(status_code=403, detail="Acesso negado")

    if body.name is not None: cc.name = body.name
    if body.description is not None: cc.description = body.description
    if body.parent_id is not None: cc.parent_id = body.parent_id
    if body.manager_name is not None: cc.manager_name = body.manager_name
    if body.budget_cents is not None: cc.budget_cents = body.budget_cents
    if body.is_active is not None: cc.is_active = body.is_active

    await db.commit()
    await db.refresh(cc)
    return cc


@router.delete("/{cc_id}", status_code=204)
async def delete_cost_center(
    cc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    result = await db.execute(select(CostCenter).where(CostCenter.id == cc_id))
    cc = result.scalar_one_or_none()
    if not cc:
        raise HTTPException(status_code=404, detail="Centro de custo não encontrado")
    if user.organization_id and cc.organization_id != user.organization_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    await db.delete(cc)
    await db.commit()
