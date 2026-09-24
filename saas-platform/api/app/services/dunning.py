import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dunning import DunningEvent, DunningRule
from app.models.invoice import Invoice
from app.models.subscription import Subscription


async def execute_dunning_rules(
    db: AsyncSession,
    organization_id: uuid.UUID,
) -> int:
    rules_result = await db.execute(
        select(DunningRule).where(
            DunningRule.organization_id == organization_id,
            DunningRule.is_active == True,
        ).order_by(DunningRule.order)
    )
    rules = rules_result.scalars().all()
    if not rules:
        return 0

    now = datetime.now(timezone.utc)
    overdue_invoices = await db.execute(
        select(Invoice).where(
            Invoice.status == "overdue",
        )
    )
    invoices = overdue_invoices.scalars().all()

    executed = 0
    for invoice in invoices:
        if not invoice.subscription_id:
            continue

        days_overdue = (now - invoice.due_date).days if invoice.due_date else 0
        if days_overdue < 0:
            continue

        subscription_result = await db.execute(
            select(Subscription).where(Subscription.id == invoice.subscription_id)
        )
        subscription = subscription_result.scalar_one_or_none()
        if not subscription:
            continue

        for rule in rules:
            if days_overdue < rule.days_after_due:
                continue

            existing = await db.execute(
                select(DunningEvent).where(
                    DunningEvent.subscription_id == subscription.id,
                    DunningEvent.rule_id == rule.id,
                    DunningEvent.action == rule.action,
                )
            )
            if existing.scalar_one_or_none():
                continue

            event = DunningEvent(
                subscription_id=subscription.id,
                invoice_id=invoice.id,
                rule_id=rule.id,
                action=rule.action,
                days_overdue=days_overdue,
                amount_cents=invoice.amount_cents or 0,
                result="executed",
                executed_at=now,
            )

            if rule.suspend_subscription and subscription.status == "past_due":
                subscription.status = "suspended"

            db.add(event)
            executed += 1

    await db.commit()
    return executed
