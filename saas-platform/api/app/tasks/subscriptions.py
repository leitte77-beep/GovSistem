import logging

from app.core.database import async_session
from app.services.subscription import generate_renewal_invoices, mark_overdue_subscriptions
from app.services.dunning import execute_dunning_rules

logger = logging.getLogger("saas.tasks.subscriptions")


async def run_renewal_invoices() -> dict:
    async with async_session() as db:
        count = len(await generate_renewal_invoices(db))
        logger.info("Generated %d renewal invoices", count)
        return {"renewal_invoices_created": count}


async def run_mark_overdue() -> dict:
    async with async_session() as db:
        count = await mark_overdue_subscriptions(db)
        logger.info("Marked %d subscriptions as overdue", count)
        return {"subscriptions_marked_overdue": count}


async def run_dunning(organization_id: str = None) -> dict:
    async with async_session() as db:
        import uuid
        from sqlalchemy import select
        from app.models.organization import Organization

        if organization_id:
            org_ids = [uuid.UUID(organization_id)]
        else:
            result = await db.execute(select(Organization.id))
            org_ids = [r[0] for r in result.all()]

        total = 0
        for org_id in org_ids:
            count = await execute_dunning_rules(db, org_id)
            total += count

        logger.info("Executed %d dunning events across %d orgs", total, len(org_ids))
        return {"dunning_events_executed": total, "organizations": len(org_ids)}
