import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_current_platform_admin
from app.core.database import get_db
from app.models.audit_event import AuditEvent
from app.models.plan import Plan
from app.models.user import User
from app.schemas.schemas import PaginatedResponse, PlanCreate, PlanResponse, PlanUpdate

router = APIRouter(prefix="/plans", tags=["plans"])


@router.get("", response_model=PaginatedResponse)
async def list_plans(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    is_active: bool | None = Query(None),
    _: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(Plan)
    count_query = select(func.count(Plan.id))
    if is_active is not None:
        query = query.where(Plan.is_active == is_active)
        count_query = count_query.where(Plan.is_active == is_active)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    skip = (page - 1) * per_page
    query = query.offset(skip).limit(per_page).order_by(Plan.price_cents)
    result = await db.execute(query)
    items = result.scalars().all()
    return PaginatedResponse(data=[PlanResponse.model_validate(p) for p in items], total=total, page=page, per_page=per_page)


@router.get("/public", response_model=list[PlanResponse])
async def list_public_plans(
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Plan).where(Plan.is_active.is_(True), Plan.is_public.is_(True))
    )
    return result.scalars().all()


@router.get("/{plan_id}", response_model=PlanResponse)
async def get_plan(
    plan_id: uuid.UUID,
    _: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    return plan


@router.post("", response_model=PlanResponse, status_code=status.HTTP_201_CREATED)
async def create_plan(
    body: PlanCreate,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Plan).where(Plan.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Plan slug already in use")

    plan = Plan(**body.model_dump())
    db.add(plan)

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        action="create",
        resource_type="plan",
        resource_id=str(plan.id),
        details={"name": plan.name, "slug": plan.slug, "price_cents": plan.price_cents},
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.put("/{plan_id}", response_model=PlanResponse)
async def update_plan(
    plan_id: uuid.UUID,
    body: PlanUpdate,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(plan, key, value)

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        action="update",
        resource_type="plan",
        resource_id=str(plan.id),
        details=update_data,
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(
    plan_id: uuid.UUID,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    plan.is_active = False

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        action="delete",
        resource_type="plan",
        resource_id=str(plan.id),
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
