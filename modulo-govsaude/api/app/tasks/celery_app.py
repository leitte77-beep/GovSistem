"""Celery do GovSaúde: integrações, relatórios, importações e manutenção."""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "govsaude",
    broker=settings.broker_url,
    backend=settings.result_backend,
    include=[
        "app.tasks.agenda",
        "app.tasks.integracoes",
        "app.tasks.manutencao",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    beat_schedule={
        "manter-particoes-auditoria": {
            "task": "govsaude.manter_particoes_auditoria",
            "schedule": crontab(hour=3, minute=10, day_of_month="1"),
        },
        "expurgar-idempotency": {
            "task": "govsaude.expurgar_idempotency",
            "schedule": crontab(hour=4, minute=0),
        },
        "processar-outbox": {
            "task": "govsaude.processar_outbox",
            "schedule": 60.0,
        },
        "marcar-faltas-automaticas": {
            "task": "govsaude.marcar_faltas_automaticas",
            "schedule": 900.0,
        },
        "descartar-frascos-vencidos": {
            "task": "govsaude.descartar_frascos_vencidos",
            "schedule": 600.0,
        },
    },
)
