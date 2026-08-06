import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_current_platform_admin, get_current_user
from app.core.database import get_db
from app.models.audit_event import AuditEvent
from app.models.financial_record import FinancialRecord
from app.models.user import User
from app.schemas.schemas import (
    FinancialRecordCreate,
    FinancialRecordResponse,
    PaginatedResponse,
)

router = APIRouter(prefix="/financial", tags=["financial"])


@router.get("/records", response_model=PaginatedResponse)
async def list_financial_records(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    organization_id: uuid.UUID | None = Query(None),
    kind: str | None = Query(None),
    days: int | None = Query(None),
    _: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(FinancialRecord)
    count_query = select(func.count(FinancialRecord.id))

    if organization_id:
        query = query.where(FinancialRecord.organization_id == organization_id)
        count_query = count_query.where(FinancialRecord.organization_id == organization_id)
    if kind:
        query = query.where(FinancialRecord.kind == kind)
        count_query = count_query.where(FinancialRecord.kind == kind)
    if days:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        query = query.where(FinancialRecord.created_at >= cutoff)
        count_query = count_query.where(FinancialRecord.created_at >= cutoff)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    skip = (page - 1) * per_page
    query = query.order_by(FinancialRecord.created_at.desc()).offset(skip).limit(per_page)
    result = await db.execute(query)
    items = result.scalars().all()

    return PaginatedResponse(data=[FinancialRecordResponse.model_validate(r) for r in items], total=total, page=page, per_page=per_page)


@router.get("/records/my", response_model=PaginatedResponse)
async def my_financial_records(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No organization")

    count_result = await db.execute(
        select(func.count(FinancialRecord.id)).where(FinancialRecord.organization_id == user.organization_id)
    )
    total = count_result.scalar() or 0

    skip = (page - 1) * per_page
    result = await db.execute(
        select(FinancialRecord)
        .where(FinancialRecord.organization_id == user.organization_id)
        .order_by(FinancialRecord.created_at.desc())
        .offset(skip)
        .limit(per_page)
    )
    items = result.scalars().all()

    return PaginatedResponse(data=[FinancialRecordResponse.model_validate(r) for r in items], total=total, page=page, per_page=per_page)


@router.post("/records", response_model=FinancialRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_financial_record(
    body: FinancialRecordCreate,
    request: Request,
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    last_result = await db.execute(
        select(FinancialRecord)
        .where(FinancialRecord.organization_id == body.organization_id)
        .order_by(FinancialRecord.created_at.desc())
        .limit(1)
    )
    last = last_result.scalar_one_or_none()
    prev_balance = last.balance_cents if last else 0

    balance_cents = prev_balance + body.amount_cents if body.kind == "revenue" else prev_balance - body.amount_cents

    record = FinancialRecord(
        organization_id=body.organization_id,
        kind=body.kind,
        description=body.description,
        amount_cents=body.amount_cents,
        balance_cents=balance_cents,
        reference_type=body.reference_type,
        reference_id=body.reference_id,
        notes=body.notes,
    )
    db.add(record)

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=body.organization_id,
        action="create",
        resource_type="financial_record",
        resource_id=str(record.id),
        details={"kind": body.kind, "amount_cents": body.amount_cents, "description": body.description},
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await db.refresh(record)
    return record


@router.get("/records/summary")
async def financial_summary(
    user: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    revenue_result = await db.execute(
        select(func.coalesce(func.sum(FinancialRecord.amount_cents), 0))
        .where(FinancialRecord.kind == "revenue")
    )
    total_revenue = revenue_result.scalar() or 0

    expense_result = await db.execute(
        select(func.coalesce(func.sum(FinancialRecord.amount_cents), 0))
        .where(FinancialRecord.kind == "expense")
    )
    total_expenses = expense_result.scalar() or 0

    balance_result = await db.execute(
        select(FinancialRecord.balance_cents)
        .order_by(FinancialRecord.created_at.desc())
        .limit(1)
    )
    current_balance = balance_result.scalar() or 0

    return {
        "total_revenue_cents": total_revenue,
        "total_expenses_cents": total_expenses,
        "current_balance_cents": current_balance,
    }
