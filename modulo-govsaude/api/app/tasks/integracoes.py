"""Worker do outbox de integrações.

Fase 0 entrega a infraestrutura: o worker encontra envios pendentes e respeita
o estado. Os adaptadores oficiais só entram na Fase 11, quando o artefato
oficial estiver em ``app/integracoes/especificacoes``. Sem especificação, o
registro permanece ``PENDENTE_ESPECIFICACAO_OFICIAL`` e não é transmitido.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from app.core.database import async_session
from app.models.enums import SituacaoEnvio
from app.models.integracoes import IntegracaoEnvio
from app.tasks.celery_app import celery_app

logger = logging.getLogger("govsaude.tasks.integracoes")

ADAPTADORES_DISPONIVEIS: set[str] = set()


async def _processar() -> int:
    async with async_session() as db:
        pendentes = (
            await db.execute(
                select(IntegracaoEnvio)
                .where(
                    IntegracaoEnvio.situacao.in_(
                        [SituacaoEnvio.PENDENTE.value, SituacaoEnvio.VALIDADO.value]
                    )
                )
                .order_by(IntegracaoEnvio.created_at)
                .limit(100)
            )
        ).scalars().all()
        processados = 0
        for envio in pendentes:
            if envio.sistema not in ADAPTADORES_DISPONIVEIS:
                # Não há artefato oficial: nada é enviado nem inventado.
                envio.mensagens = [
                    {
                        "codigo": "PENDENTE_ESPECIFICACAO_OFICIAL",
                        "texto": (
                            "Adaptador oficial ainda não disponível. "
                            "Consulte docs/pendencias-oficiais.md."
                        ),
                    }
                ]
                continue
            processados += 1
        await db.commit()
        return processados


@celery_app.task(name="govsaude.processar_outbox")
def processar_outbox() -> int:
    return asyncio.run(_processar())
