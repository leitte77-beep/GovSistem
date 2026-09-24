import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.accounting_period import AccountingPeriod
from app.models.user import User

router = APIRouter(prefix="/accounting-periods", tags=["accounting-periods"])


class PeriodResponse(BaseModel):
    id: uuid.UUID
    year: int
    month: int
    start_date: str
    end_date: str
    status: str
    closed_at: Optional[str] = None
    closed_by: Optional[str] = None
    reopened_at: Optional[str] = None
    reopened_by: Optional[str] = None
    reopen_reason: Optional[str] = None
    notes: Optional[str] = None
    created_at: str

    model_config = {"from_attributes": True}


class PaginatedPeriods(BaseModel):
    data: list[PeriodResponse]
    total: int


MONTHS = list(range(1, 13))


async def _period_to_response(p: AccountingPeriod) -> PeriodResponse:
    return PeriodResponse(
        id=p.id,
        year=p.year,
        month=p.month,
        start_date=p.start_date.isoformat() if p.start_date else "",
        end_date=p.end_date.isoformat() if p.end_date else "",
        status=p.status,
        closed_at=p.closed_at.isoformat() if p.closed_at else None,
        closed_by=str(p.closed_by) if p.closed_by else None,
        reopened_at=p.reopened_at.isoformat() if p.reopened_at else None,
        reopened_by=str(p.reopened_by) if p.reopened_by else None,
        reopen_reason=p.reopen_reason,
        notes=p.notes,
        created_at=str(p.created_at),
    )


@router.get("", response_model=PaginatedPeriods)
async def list_periods(
    year: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    query = select(AccountingPeriod)
    count_query = select(func.count(AccountingPeriod.id))

    if year:
        query = query.where(AccountingPeriod.year == year)
        count_query = count_query.where(AccountingPeriod.year == year)
    if status:
        query = query.where(AccountingPeriod.status == status)
        count_query = count_query.where(AccountingPeriod.status == status)

    total = await db.scalar(count_query) or 0
    result = await db.execute(query.order_by(AccountingPeriod.year.desc(), AccountingPeriod.month.desc()))
    items = result.scalars().all()

    return PaginatedPeriods(
        data=[await _period_to_response(p) for p in items],
        total=total,
    )


@router.post("/open", response_model=PeriodResponse, status_code=201)
async def open_period(
    year: int = Query(...),
    month: int = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    existing = await db.execute(
        select(AccountingPeriod).where(
            AccountingPeriod.organization_id == user.organization_id,
            AccountingPeriod.year == year,
            AccountingPeriod.month == month,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Periodo {year}/{month} ja existe")

    from calendar import monthrange
    start_date = datetime(year, month, 1, tzinfo=timezone.utc)
    last_day = monthrange(year, month)[1]
    end_date = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)

    period = AccountingPeriod(
        organization_id=user.organization_id,
        year=year,
        month=month,
        start_date=start_date,
        end_date=end_date,
        status="open",
    )
    db.add(period)
    await db.commit()
    await db.refresh(period)
    return await _period_to_response(period)


@router.post("/{period_id}/close", response_model=PeriodResponse)
async def close_period(
    period_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    result = await db.execute(select(AccountingPeriod).where(AccountingPeriod.id == period_id))
    period = result.scalar_one_or_none()
    if not period:
        raise HTTPException(status_code=404, detail="Periodo nao encontrado")
    if period.status == "closed":
        raise HTTPException(status_code=400, detail="Periodo ja esta fechado")

    period.status = "closed"
    period.closed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    period.closed_by = user.id
    await db.commit()
    await db.refresh(period)
    return await _period_to_response(period)


@router.post("/{period_id}/reopen", response_model=PeriodResponse)
async def reopen_period(
    period_id: uuid.UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    reason = body.get("reason", "")
    if not reason:
        raise HTTPException(status_code=400, detail="Motivo da reabertura e obrigatorio")

    result = await db.execute(select(AccountingPeriod).where(AccountingPeriod.id == period_id))
    period = result.scalar_one_or_none()
    if not period:
        raise HTTPException(status_code=404, detail="Periodo nao encontrado")
    if period.status != "closed":
        raise HTTPException(status_code=400, detail="Periodo nao esta fechado")

    period.status = "open"
    period.reopened_at = datetime.now(timezone.utc).replace(tzinfo=None)
    period.reopened_by = user.id
    period.reopen_reason = reason
    await db.commit()
    await db.refresh(period)
    return await _period_to_response(period)
