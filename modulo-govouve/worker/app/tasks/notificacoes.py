"""Tarefas de notificacao (e-mail, etc.)."""

from celery import shared_task


@shared_task
def enviar_notificacao(manifestacao_id: str, canal: str):
    pass
