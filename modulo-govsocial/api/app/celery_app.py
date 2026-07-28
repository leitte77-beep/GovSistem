"""Celery app configuration — Redis broker, periodic beat, task registry."""

import os

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "govsocial",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
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
    broker_transport_options={"visibility_timeout": 3600},
    result_expires=3600,
    imports=("app.tasks",),
)

celery_app.conf.beat_schedule = {
    "limpar-dados-expirados-diario": {
        "task": "app.tasks.limpar_dados_expirados",
        "schedule": crontab(hour=3, minute=0),
        "options": {"queue": "default"},
    },
}
