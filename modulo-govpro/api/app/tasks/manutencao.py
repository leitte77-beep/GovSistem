"""Tarefas de manutenção agendadas (Celery).

Reaproveitam a lógica já existente e testada em services/sigilo.py
(`desclassificar_expirados`) e services/sobrestamento.py (`reativar_expirados`).
"""

import asyncio
import logging

from app.celery_app import celery_app
from app.core.database import async_session
from app.services import sigilo, sobrestamento

logger = logging.getLogger("govpro.tasks.manutencao")


@celery_app.task(name="app.tasks.manutencao.desclassificar_sigilos_expirados")
def desclassificar_sigilos_expirados() -> int:
    """Desclassifica automaticamente processos/documentos com sigilo vencido (LAI)."""

    async def _run() -> int:
        async with async_session() as db:
            contagem = await sigilo.desclassificar_expirados(db)
            if contagem:
                logger.info("Desclassificados %d alvos com sigilo vencido", contagem)
            return contagem

    return asyncio.run(_run())


@celery_app.task(name="app.tasks.manutencao.reativar_sobrestamentos_expirados")
def reativar_sobrestamentos_expirados() -> int:
    """Reativa automaticamente processos cujo sobrestamento atingiu o fim previsto."""

    async def _run() -> int:
        async with async_session() as db:
            contagem = await sobrestamento.reativar_expirados(db)
            if contagem:
                logger.info("Reativados %d processos com sobrestamento vencido", contagem)
            return contagem

    return asyncio.run(_run())
