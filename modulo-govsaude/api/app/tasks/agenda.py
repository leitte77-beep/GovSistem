"""Tarefas periódicas da agenda: falta automática e vencimento (B.12-018)."""

from __future__ import annotations

import asyncio
import logging

from app.core.database import async_session
from app.services.agendamentos import marcar_faltas_automaticas
from app.tasks.celery_app import celery_app

logger = logging.getLogger("govsaude.tasks.agenda")


async def _marcar_faltas() -> dict:
    async with async_session() as db:
        try:
            resultado = await marcar_faltas_automaticas(db)
            logger.info("Faltas automáticas: %s", resultado)
            return resultado
        except Exception:  # noqa: BLE001 - mantém a tarefa viva para nova tentativa
            await db.rollback()
            logger.exception("Falha ao marcar faltas automáticas")
            raise


@celery_app.task(name="govsaude.marcar_faltas_automaticas")
def marcar_faltas_automaticas_task() -> dict:
    return asyncio.run(_marcar_faltas())
