import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_client_info, get_current_platform_admin, get_current_user
from app.core.database import get_db
from app.models.audit_event import AuditEvent
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.schemas import (
    PaginatedResponse,
    SubscriptionCreate,
    SubscriptionResponse,
    SubscriptionUpdate,
)

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


@router.get("", response_model=PaginatedResponse)
async def list_subscriptions(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    organization_id: uuid.UUID | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    _: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Subscription)
        .options(selectinload(Subscription.plan), selectinload(Subscription.organization))
    )
    count_query = select(func.count(Subscription.id))

    if organization_id:
        query = query.where(Subscription.organization_id == organization_id)
        count_query = count_query.where(Subscription.organization_id == organization_id)
    if status_filter:
        query = query.where(Subscription.status == status_filter)
        count_query = count_query.where(Subscription.status == status_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    skip = (page - 1) * per_page
    query = query.offset(skip).limit(per_page).order_by(Subscription.created_at.desc())
    result = await db.execute(query)
    items = result.scalars().all()

    return PaginatedResponse(data=[SubscriptionResponse.model_validate(s) for s in items], total=total, page=page, per_page=per_page)


@router.get("/my", response_model=PaginatedResponse)
async def my_subscriptions(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No organization")

    count_result = await db.execute(
        select(func.count(Subscription.id)).where(Subscription.organization_id == user.organization_id)
    )
    total = count_result.scalar() or 0

    skip = (page - 1) * per_page
    result = await db.execute(
        select(Subscription)
        .where(Subscription.organization_id == user.organization_id)
        .options(selectinload(Subscription.plan))
        .order_by(Subscription.created_at.desc())
        .offset(skip)
        .limit(per_page)
    )
    items = result.scalars().all()

    return PaginatedResponse(data=[SubscriptionResponse.model_validate(s) for s in items], total=total, page=page, per_page=per_page)


@router.get("/{sub_id}", response_model=SubscriptionResponse)
async def get_subscription(
    sub_id: uuid.UUID,
    _: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subscription)
        .where(Subscription.id == sub_id)
        .options(selectinload(Subscription.plan), selectinload(Subscription.organization))
    )
    subscription = result.scalar_one_or_none()
    if not subscription:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    return subscription


@router.post("", response_model=SubscriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_subscription(
    body: SubscriptionCreate,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    plan_result = await db.execute(select(Plan).where(Plan.id == body.plan_id, Plan.is_active.is_(True)))
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Plan not found or inactive")

    now = datetime.now(timezone.utc)
    trial_days = body.trial_days_override if body.trial_days_override is not None else plan.trial_days
    trial_ends = now + timedelta(days=trial_days) if trial_days > 0 else None

    if plan.billing_cycle == "monthly":
        period_end = now + timedelta(days=30)
    elif plan.billing_cycle == "quarterly":
        period_end = now + timedelta(days=90)
    elif plan.billing_cycle == "semiannual":
        period_end = now + timedelta(days=180)
    else:
        period_end = now + timedelta(days=365)

    status_val = "trial" if trial_ends else "active"

    subscription = Subscription(
        organization_id=body.organization_id,
        plan_id=body.plan_id,
        status=status_val,
        started_at=now,
        current_period_start=now,
        current_period_end=period_end,
        trial_ends_at=trial_ends,
        auto_renew=body.auto_renew,
    )
    db.add(subscription)

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=body.organization_id,
        action="create",
        resource_type="subscription",
        resource_id=str(subscription.id),
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await db.refresh(subscription)
    return subscription


@router.put("/{sub_id}", response_model=SubscriptionResponse)
async def update_subscription(
    sub_id: uuid.UUID,
    body: SubscriptionUpdate,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Subscription).where(Subscription.id == sub_id))
    subscription = result.scalar_one_or_none()
    if not subscription:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(subscription, key, value)

    if "status" in update_data and update_data["status"] == "cancelled":
        subscription.cancelled_at = datetime.now(timezone.utc)

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=subscription.organization_id,
        action="update",
        resource_type="subscription",
        resource_id=str(subscription.id),
        details=update_data,
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await db.refresh(subscription)
    return subscription
