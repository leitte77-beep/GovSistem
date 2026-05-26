import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin, get_current_user
from app.core.database import get_db
from app.models.invoice import Invoice
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.models.payable import Payable
from app.models.plan import Plan
from app.models.receivable import Receivable
from app.models.subscription import Subscription
from app.models.user import User

router = APIRouter(prefix="/reports", tags=["reports"])


async def _compute_finance_dashboard(db: AsyncSession):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    gross_revenue = await db.scalar(
        select(func.coalesce(func.sum(Invoice.amount_cents), 0)).where(
            Invoice.status == "paid",
            Invoice.paid_at >= month_start,
        )
    )

    mrr = await db.scalar(
        select(func.coalesce(func.sum(Invoice.amount_cents), 0)).where(
            Invoice.status == "paid",
            Invoice.created_at >= now - timedelta(days=30),
        )
    )

    total_receivable = await db.scalar(
        select(func.coalesce(func.sum(Receivable.open_amount_cents), 0)).where(
            Receivable.status.in_(["open", "due", "overdue"])
        )
    )

    overdue = await db.scalar(
        select(func.count(Receivable.id)).where(
            Receivable.status.in_(["overdue", "in_collection"]),
            Receivable.due_date < datetime.now(timezone.utc).replace(tzinfo=None),
        )
    )

    total_payable = await db.scalar(
        select(func.coalesce(func.sum(Payable.amount_cents), 0)).where(
            Payable.status.in_(["approved", "scheduled"])
        )
    )

    active_subs = await db.scalar(
        select(func.count(Subscription.id)).where(Subscription.status == "active")
    )

    total_invoiced = await db.scalar(
        select(func.coalesce(func.sum(Invoice.amount_cents), 0)).where(
            Invoice.created_at >= month_start
        )
    )

    return {
        "gross_revenue_cents": gross_revenue or 0,
        "monthly_recurring_revenue_cents": mrr or 0,
        "total_receivable_cents": total_receivable or 0,
        "overdue_count": overdue or 0,
        "total_payable_cents": total_payable or 0,
        "active_subscriptions": active_subs or 0,
        "month_to_date_invoiced_cents": total_invoiced or 0,
    }


@router.get("/dashboard")
async def finance_dashboard(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    return await _compute_finance_dashboard(db)


@router.get("/mrr")
async def mrr_report(
    months: int = Query(12, ge=1, le=60),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    results = []
    for i in range(months - 1, -1, -1):
        start = (now.replace(day=1) - timedelta(days=30 * i)).replace(day=1)
        end = (start.replace(month=start.month % 12 + 1, year=start.year + start.month // 12)) if start.month == 12 else start.replace(month=start.month + 1)

        value = await db.scalar(
            select(func.coalesce(func.sum(Invoice.amount_cents), 0)).where(
                Invoice.status == "paid",
                Invoice.paid_at >= start,
                Invoice.paid_at < end,
            )
        )
        results.append({
            "year": start.year,
            "month": start.month,
            "revenue_cents": value or 0,
        })
    return {"data": results}


@router.get("/sales-by-plan")
async def sales_by_plan(
    days: int = Query(90, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    result = await db.execute(
        select(
            Plan.name,
            Plan.slug,
            func.count(Subscription.id).label("subscriptions"),
            func.coalesce(func.sum(Invoice.amount_cents), 0).label("revenue_cents"),
        )
        .select_from(Plan)
        .outerjoin(Subscription, Subscription.plan_id == Plan.id)
        .outerjoin(Invoice, Invoice.subscription_id == Subscription.id)
        .where(Subscription.created_at >= cutoff)
        .group_by(Plan.id, Plan.name, Plan.slug)
        .order_by(text("revenue_cents desc"))
    )
    rows = result.all()
    return {
        "data": [
            {
                "plan_name": r.name,
                "plan_slug": r.slug,
                "subscriptions": r.subscriptions,
                "revenue_cents": r.revenue_cents or 0,
            }
            for r in rows
        ]
    }


@router.get("/receivable-aging")
async def receivable_aging(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    buckets = {
        "current": 0,
        "1_30": 0,
        "31_60": 0,
        "61_90": 0,
        "91_plus": 0,
    }

    result = await db.execute(
        select(Receivable.open_amount_cents, Receivable.due_date).where(
            Receivable.status.in_(["open", "due", "overdue", "in_collection"])
        )
    )
    for row in result.all():
        days_late = (now - row.due_date).days
        if days_late <= 0:
            buckets["current"] += row.open_amount_cents
        elif days_late <= 30:
            buckets["1_30"] += row.open_amount_cents
        elif days_late <= 60:
            buckets["31_60"] += row.open_amount_cents
        elif days_late <= 90:
            buckets["61_90"] += row.open_amount_cents
        else:
            buckets["91_plus"] += row.open_amount_cents

    total = sum(buckets.values())
    return {"aging": buckets, "total_cents": total}


@router.get("/cash-flow")
async def cash_flow(
    days: int = Query(30, ge=1, le=180),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    end = now + timedelta(days=days)

    receivables = await db.execute(
        select(
            func.coalesce(func.sum(Receivable.open_amount_cents), 0),
            func.count(Receivable.id),
        ).where(
            Receivable.due_date.between(now, end),
            Receivable.status.in_(["open", "due"]),
        )
    )
    row = receivables.one()
    expected_inflow = row[0] or 0
    expected_inflow_count = row[1] or 0

    payables = await db.execute(
        select(
            func.coalesce(func.sum(Payable.amount_cents), 0),
            func.count(Payable.id),
        ).where(
            Payable.due_date.between(now, end),
            Payable.status.in_(["approved", "scheduled"]),
        )
    )
    row = payables.one()
    expected_outflow = row[0] or 0
    expected_outflow_count = row[1] or 0

    return {
        "expected_inflow_cents": expected_inflow,
        "expected_inflow_count": expected_inflow_count,
        "expected_outflow_cents": expected_outflow,
        "expected_outflow_count": expected_outflow_count,
        "projected_balance_cents": expected_inflow - expected_outflow,
    }


@router.get("/income-statement")
async def income_statement(
    year: int = Query(None),
    month: int = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    ref_date = datetime.now(timezone.utc).replace(tzinfo=None)
    year = year or ref_date.year
    month = month or ref_date.month

    revenue = await db.scalar(
        select(func.coalesce(func.sum(JournalEntryLine.credit_cents), 0)).where(
            JournalEntryLine.credit_cents > 0,
            JournalEntry.status == "posted",
            func.extract("year", JournalEntry.competence_date) == year,
            func.extract("month", JournalEntry.competence_date) == month,
        )
        .select_from(JournalEntryLine)
        .join(JournalEntry, JournalEntryLine.entry_id == JournalEntry.id)
    )

    expenses = await db.scalar(
        select(func.coalesce(func.sum(JournalEntryLine.debit_cents), 0)).where(
            JournalEntryLine.debit_cents > 0,
            JournalEntry.status == "posted",
            func.extract("year", JournalEntry.competence_date) == year,
            func.extract("month", JournalEntry.competence_date) == month,
        )
        .select_from(JournalEntryLine)
        .join(JournalEntry, JournalEntryLine.entry_id == JournalEntry.id)
    )

    net = (revenue or 0) - (expenses or 0)

    return {
        "year": year,
        "month": month,
        "revenue_cents": revenue or 0,
        "expenses_cents": expenses or 0,
        "net_income_cents": net,
    }


@router.get("/trial-balance")
async def trial_balance(
    year: int = Query(None),
    month: int = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    ref_date = datetime.now(timezone.utc).replace(tzinfo=None)
    year = year or ref_date.year
    month = month or ref_date.month

    result = await db.execute(
        select(
            JournalEntryLine.account_id,
            func.sum(JournalEntryLine.debit_cents).label("total_debit"),
            func.sum(JournalEntryLine.credit_cents).label("total_credit"),
        )
        .join(JournalEntry, JournalEntryLine.entry_id == JournalEntry.id)
        .where(
            JournalEntry.status == "posted",
            func.extract("year", JournalEntry.competence_date) == year,
            func.extract("month", JournalEntry.competence_date) == month,
        )
        .group_by(JournalEntryLine.account_id)
        .order_by(JournalEntryLine.account_id)
    )
    rows = result.all()

    return {
        "year": year,
        "month": month,
        "accounts": [
            {
                "account_id": str(r.account_id),
                "debit_cents": r.total_debit or 0,
                "credit_cents": r.total_credit or 0,
                "balance_cents": (r.total_debit or 0) - (r.total_credit or 0),
            }
            for r in rows
        ],
    }
