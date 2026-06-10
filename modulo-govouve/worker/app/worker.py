"""Worker app entry point for GovOuve Celery worker."""

from celery import Celery
from app.config import settings

celery_app = Celery(
    "govouve_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Sao_Paulo",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
    imports=[
        "app.tasks.prazos",
        "app.tasks.notificacoes",
    ],
)

celery_app.conf.beat_schedule = {
    "verificar-prazos-diariamente": {
        "task": "app.tasks.prazos.verificar_prazos",
        "schedule": 3600.0,
    },
    "disparar-alertas-prazo": {
        "task": "app.tasks.prazos.disparar_alertas_prazo",
        "schedule": 3600.0,
    },
}
