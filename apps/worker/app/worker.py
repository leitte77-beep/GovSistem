import logging

from celery import Celery
from celery.schedules import crontab

from app.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "doe_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.health", "app.tasks.generate_edition_pdf", "app.tasks.backup_scheduler"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Sao_Paulo",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "backup-scheduler-every-5-minutes": {
            "task": "backup.scheduler",
            "schedule": crontab(minute="*/5"),
            "options": {"expires": 240},
        },
    },
)


@celery_app.task(bind=True)
def debug_task(self):
    logger.debug("Request: %s", self.request)
