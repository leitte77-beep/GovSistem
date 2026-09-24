import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.subscription_event import SubscriptionEvent
from app.models.user import User


async def record_subscription_event(
    db: AsyncSession,
    subscription_id: uuid.UUID,
    organization_id: uuid.UUID,
    event_type: str,
    new_status: str,
    old_status: Optional[str] = None,
    old_plan_id: Optional[uuid.UUID] = None,
    new_plan_id: Optional[uuid.UUID] = None,
    amount_cents: Optional[int] = None,
    details: Optional[dict] = None,
    triggered_by: Optional[str] = None,
):
    event = SubscriptionEvent(
        subscription_id=subscription_id,
        organization_id=organization_id,
        event_type=event_type,
        old_status=old_status,
        new_status=new_status,
        old_plan_id=old_plan_id,
        new_plan_id=new_plan_id,
        amount_cents=amount_cents,
        details=details or {},
        triggered_by=triggered_by,
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(event)
    await db.flush()


async def generate_renewal_invoices(
    db: AsyncSession,
    limit: int = 50,
) -> list[Invoice]:
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=7)

    result = await db.execute(
        select(Subscription)
        .where(Subscription.status.in_(["active", "trial"]))
        .where(Subscription.current_period_end <= cutoff)
        .limit(limit)
    )
    subscriptions = result.scalars().all()

    invoices: list[Invoice] = []
    for sub in subscriptions:
        if not sub.plan:
            continue

        existing = await db.execute(
            select(func.count(Invoice.id)).where(
                Invoice.subscription_id == sub.id,
                Invoice.status.in_(["pending", "open", "awaiting_payment"]),
            )
        )
        if existing.scalar() or 0 > 0:
            continue

        period_start = sub.current_period_end
        if sub.plan.billing_cycle == "monthly":
            period_end = period_start + timedelta(days=30)
        elif sub.plan.billing_cycle == "quarterly":
            period_end = period_start + timedelta(days=90)
        elif sub.plan.billing_cycle == "semiannual":
            period_end = period_start + timedelta(days=180)
        else:
            period_end = period_start + timedelta(days=365)

        count_result = await db.execute(select(func.count(Invoice.id)))
        count = count_result.scalar() or 0

        inv = Invoice(
            subscription_id=sub.id,
            invoice_number=f"INV-{now.strftime('%Y%m')}-{count + len(invoices) + 1:04d}",
            amount_cents=sub.plan.price_cents,
            due_date=period_start + timedelta(days=5),
            period_start=period_start,
            period_end=period_end,
            status="open",
        )
        db.add(inv)
        invoices.append(inv)

        sub.current_period_start = period_start
        sub.current_period_end = period_end

    if invoices:
        await db.commit()
        for inv in invoices:
            await db.refresh(inv)

    return invoices


async def mark_overdue_subscriptions(db: AsyncSession) -> int:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Invoice).where(
            Invoice.status.in_(["open", "awaiting_payment"]),
            Invoice.due_date < now,
        )
    )
    overdue_invoices = result.scalars().all()

    count = 0
    for inv in overdue_invoices:
        inv.status = "overdue"
        sub_result = await db.execute(
            select(Subscription).where(Subscription.id == inv.subscription_id)
        )
        sub = sub_result.scalar_one_or_none()
        if sub and sub.status == "active":
            old_status = sub.status
            sub.status = "past_due"
            await record_subscription_event(
                db=db,
                subscription_id=sub.id,
                organization_id=sub.organization_id,
                event_type="overdue",
                old_status=old_status,
                new_status="past_due",
                amount_cents=inv.amount_cents,
                triggered_by="system",
            )
            count += 1

    await db.commit()
    return count
