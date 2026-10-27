"""Worker da central de integrações (Fase 11, B.7-022/023, B.12-061).

A cada minuto verifica as configurações com transmissão automática cuja
periodicidade venceu e executa geração → validação → transmissão das
competências abertas. Desligado por padrão (``INTEGRACOES_AUTOMATICAS``).
Sem manifesto oficial, nada é transmitido.
"""

from __future__ import annotations

import asyncio
import logging

from app.core.config import settings
from app.core.database import async_session
from app.tasks.celery_app import celery_app

logger = logging.getLogger("govsaude.tasks.integracoes")


async def _processar() -> dict:
    from app.services.integracoes import executar_automaticas

    if not settings.INTEGRACOES_AUTOMATICAS:
        return {"desligado": True}
    async with async_session() as db:
        try:
            return await executar_automaticas(db)
        except Exception:  # noqa: BLE001 - mantém a tarefa viva para a próxima rodada
            await db.rollback()
            logger.exception("Falha na execução automática de integrações")
            raise


@celery_app.task(name="govsaude.processar_outbox")
def processar_outbox() -> dict:
    return asyncio.run(_processar())
