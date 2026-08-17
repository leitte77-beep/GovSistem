"""Celery app do GovPro — Redis broker, beat schedule e registro de tarefas.

Jobs de manutenção (desclassificação automática de sigilo e reativação de
sobrestamento) rodam no worker; a lógica de negócio fica em services/sigilo.py
e services/sobrestamento.py (já testada) — aqui só há o agendamento.
"""

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "govpro",
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
    imports=("app.tasks.manutencao",),
)

celery_app.conf.beat_schedule = {
    "desclassificar-sigilos-expirados": {
        "task": "app.tasks.manutencao.desclassificar_sigilos_expirados",
        "schedule": crontab(minute=0),  # a cada hora
        "options": {"queue": "default"},
    },
    "reativar-sobrestamentos-expirados": {
        "task": "app.tasks.manutencao.reativar_sobrestamentos_expirados",
        "schedule": crontab(minute=30),  # a cada hora, defasado do anterior
        "options": {"queue": "default"},
    },
}
