from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.invoice import Invoice
from app.models.payable import Payable
from app.models.plan import Plan
from app.models.receivable import Receivable
from app.models.subscription import Subscription
from app.models.user import User

router = APIRouter(prefix="/reports", tags=["reports-finance"])


@router.get("/sales-by-plan")
async def sales_by_plan(
    year: int = Query(None),
    month: int = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    ref = datetime.now(timezone.utc)
    year = year or ref.year
    month = month or ref.month

    result = await db.execute(
        select(
            Plan.name,
            func.count(Invoice.id).label("total_invoices"),
            func.sum(Invoice.amount_cents).label("total_cents"),
        )
        .select_from(Invoice)
        .join(Subscription, Invoice.subscription_id == Subscription.id)
        .join(Plan, Subscription.plan_id == Plan.id)
        .where(
            Invoice.status == "paid",
            func.extract("year", Invoice.paid_at) == year,
            func.extract("month", Invoice.paid_at) == month,
        )
        .group_by(Plan.name)
        .order_by(func.sum(Invoice.amount_cents).desc())
    )
    rows = result.all()

    return {
        "year": year,
        "month": month,
        "data": [
            {
                "plan": r.name,
                "total_invoices": r.total_invoices,
                "total_cents": r.total_cents or 0,
            }
            for r in rows
        ],
        "total_cents": sum((r.total_cents or 0) for r in rows),
    }


@router.get("/cash-flow")
async def cash_flow(
    months: int = Query(6, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    now = datetime.now(timezone.utc)
    results = []

    for i in range(months):
        year = (now.year if now.month - i > 0 else now.year - 1)
        month = (now.month - i) if now.month - i > 0 else 12 + (now.month - i)
        if month == 0:
            month = 12
            year -= 1

        received = await db.scalar(
            select(func.coalesce(func.sum(Invoice.amount_cents), 0)).where(
                Invoice.status == "paid",
                func.extract("year", Invoice.paid_at) == year,
                func.extract("month", Invoice.paid_at) == month,
            )
        ) or 0

        paid_out = await db.scalar(
            select(func.coalesce(func.sum(Payable.amount_cents), 0)).where(
                Payable.status == "paid",
                func.extract("year", Payable.paid_at) == year,
                func.extract("month", Payable.paid_at) == month,
            )
        ) or 0

        results.append({
            "year": year,
            "month": month,
            "received_cents": received,
            "paid_cents": paid_out,
            "balance_cents": received - paid_out,
        })

    return {"data": list(reversed(results))}


@router.get("/receivable-aging")
async def receivable_aging(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    now = datetime.now(timezone.utc)

    current = await db.scalar(
        select(func.coalesce(func.sum(Receivable.open_amount_cents), 0)).where(
            Receivable.status == "open",
            Receivable.due_date >= now,
        )
    ) or 0

    overdue_1_30 = await db.scalar(
        select(func.coalesce(func.sum(Receivable.open_amount_cents), 0)).where(
            Receivable.status.in_(["open", "overdue"]),
            Receivable.due_date < now,
            Receivable.due_date >= now - timedelta(days=30),
        )
    ) or 0

    overdue_31_60 = await db.scalar(
        select(func.coalesce(func.sum(Receivable.open_amount_cents), 0)).where(
            Receivable.status.in_(["open", "overdue"]),
            Receivable.due_date < now - timedelta(days=30),
            Receivable.due_date >= now - timedelta(days=60),
        )
    ) or 0

    overdue_61_90 = await db.scalar(
        select(func.coalesce(func.sum(Receivable.open_amount_cents), 0)).where(
            Receivable.status.in_(["open", "overdue"]),
            Receivable.due_date < now - timedelta(days=60),
            Receivable.due_date >= now - timedelta(days=90),
        )
    ) or 0

    overdue_90_plus = await db.scalar(
        select(func.coalesce(func.sum(Receivable.open_amount_cents), 0)).where(
            Receivable.status.in_(["open", "overdue"]),
            Receivable.due_date < now - timedelta(days=90),
        )
    ) or 0

    return {
        "current_cents": current,
        "overdue_1_30_cents": overdue_1_30,
        "overdue_31_60_cents": overdue_31_60,
        "overdue_61_90_cents": overdue_61_90,
        "overdue_90_plus_cents": overdue_90_plus,
        "total_overdue_cents": overdue_1_30 + overdue_31_60 + overdue_61_90 + overdue_90_plus,
        "total_receivable_cents": current + overdue_1_30 + overdue_31_60 + overdue_61_90 + overdue_90_plus,
    }
