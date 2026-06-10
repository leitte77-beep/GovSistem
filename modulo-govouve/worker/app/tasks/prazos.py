"""Tarefa de verificacao de prazos de manifestacoes."""

from celery import shared_task


@shared_task
def verificar_prazos():
    pass


@shared_task
def disparar_alertas_prazo():
    pass
