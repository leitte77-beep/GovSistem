import asyncio
import logging

from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

logger = logging.getLogger("saas.worker")

celery_app = Celery(
    "saas",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.webhooks", "app.tasks.subscriptions"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Sao_Paulo",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,
    task_soft_time_limit=240,
)

celery_app.conf.beat_schedule = {
    "renew-subscriptions-daily": {
        "task": "app.tasks.subscriptions.run_renewal_invoices_task",
        "schedule": crontab(hour=2, minute=0),
    },
    "mark-overdue-subscriptions-daily": {
        "task": "app.tasks.subscriptions.run_mark_overdue_task",
        "schedule": crontab(hour=3, minute=0),
    },
    "run-dunning-daily": {
        "task": "app.tasks.subscriptions.run_dunning_task",
        "schedule": crontab(hour=4, minute=0),
    },
}


@celery_app.task(bind=True, max_retries=3)
def process_webhook_event_task(self, event_id: str):
    try:
        result = asyncio.run(_async_process_webhook(event_id))
        logger.info("Webhook %s processed: %s", event_id, result)
        return result
    except Exception as exc:
        logger.error("Webhook %s failed: %s", event_id, exc)
        raise self.retry(exc=exc, countdown=60)


async def _async_process_webhook(event_id: str):
    from app.tasks.webhooks import process_webhook_event
    return await process_webhook_event(event_id)


@celery_app.task
def run_renewal_invoices_task():
    return asyncio.run(_async_renewal_invoices())


async def _async_renewal_invoices():
    from app.tasks.subscriptions import run_renewal_invoices
    return await run_renewal_invoices()


@celery_app.task
def run_mark_overdue_task():
    return asyncio.run(_async_mark_overdue())


async def _async_mark_overdue():
    from app.tasks.subscriptions import run_mark_overdue
    return await run_mark_overdue()


@celery_app.task
def run_dunning_task():
    return asyncio.run(_async_dunning())


async def _async_dunning():
    from app.tasks.subscriptions import run_dunning
    return await run_dunning()
