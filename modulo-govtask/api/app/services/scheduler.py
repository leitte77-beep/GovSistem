"""Verificação periódica de prazos.

`verificar_prazos` sempre existiu, mas nada a chamava: só rodava se alguém
apertasse o botão em Configurações. Na prática, "prazo vencido" e "atraso
escalado" nunca chegavam sozinhos a ninguém — que é justamente o ponto de uma
notificação.

Aqui ela passa a rodar de hora em hora, organização por organização. A função
é idempotente no dia (não duplica notificação para a mesma tarefa e tipo), então
repetir a varredura é inofensivo — e é essa propriedade que permite rodar em um
loop simples, sem fila nem estado externo.
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session
from app.models.organization import Organization
from app.services import email_outbox
from app.services.notifications import verificar_prazos
from app.services.prazos import varrer_organizacao

logger = logging.getLogger("govtask.scheduler")

_task: asyncio.Task | None = None
_task_outbox: asyncio.Task | None = None


async def _varrer_organizacoes() -> None:
    async with async_session() as db:
        orgs = (await db.execute(
            select(Organization.id).where(Organization.deleted_at.is_(None))
        )).scalars().all()

    for organization_id in orgs:
        # Uma sessão por organização: o erro de um tenant não derruba os outros.
        try:
            # Motor v2 (demandas) e verificação legada (convênios) rodam lado a
            # lado enquanto as duas árvores coexistem.
            async with async_session() as db:
                resultado = await varrer_organizacao(db, organization_id)
            async with async_session() as db:
                legado = await verificar_prazos(db, organization_id)
            # Uma passagem por organização: `varrer_organizacao` cobre tarefas,
            # demandas, etapas, protocolos e o escalonamento.
            resultado = {**resultado, **{f"legado_{k}": v for k, v in legado.items()}}
            if any(resultado.values()):
                logger.info(
                    "prazos e alertas verificados",
                    extra={"organization_id": str(organization_id), **resultado},
                )
        except Exception:
            logger.exception(
                "falha ao verificar prazos da organização %s", organization_id
            )


async def _loop() -> None:
    intervalo = max(settings.DEADLINE_CHECK_INTERVAL_MINUTES, 1) * 60
    # Uma folga inicial para não competir com o boot da aplicação.
    await asyncio.sleep(min(60, intervalo))
    while True:
        inicio = datetime.now(timezone.utc)
        try:
            await _varrer_organizacoes()
        except Exception:
            logger.exception("varredura de prazos interrompida")
        gasto = (datetime.now(timezone.utc) - inicio).total_seconds()
        await asyncio.sleep(max(intervalo - gasto, 60))


async def _loop_outbox() -> None:
    intervalo = max(settings.EMAIL_OUTBOX_INTERVAL_MINUTES, 1) * 60
    # Entrega de e-mail é mais sensível ao tempo que a varredura de prazos;
    # uma folga curta evita esperar o primeiro minuto inteiro no boot.
    await asyncio.sleep(min(30, intervalo))
    while True:
        inicio = datetime.now(timezone.utc)
        try:
            async with async_session() as db:
                resultado = await email_outbox.processar_pendentes(db)
            if resultado["processados"]:
                logger.info("outbox de e-mail processada", extra=resultado)
        except Exception:
            logger.exception("processamento da outbox de e-mail interrompido")
        gasto = (datetime.now(timezone.utc) - inicio).total_seconds()
        await asyncio.sleep(max(intervalo - gasto, 30))


def start() -> None:
    """Sobe os loops habilitados. Chamado uma vez, no startup."""
    global _task, _task_outbox
    if settings.DEADLINE_CHECK_ENABLED and not (_task and not _task.done()):
        _task = asyncio.create_task(_loop(), name="govtask-verificar-prazos")
        logger.info(
            "verificação automática de prazos a cada %s min",
            settings.DEADLINE_CHECK_INTERVAL_MINUTES,
        )
    if not settings.DEADLINE_CHECK_ENABLED:
        logger.info("verificação automática de prazos desabilitada")

    if settings.EMAIL_OUTBOX_ENABLED and not (_task_outbox and not _task_outbox.done()):
        _task_outbox = asyncio.create_task(_loop_outbox(), name="govtask-email-outbox")
        logger.info(
            "outbox de e-mail a cada %s min",
            settings.EMAIL_OUTBOX_INTERVAL_MINUTES,
        )


async def _cancelar(tarefa: asyncio.Task | None) -> None:
    if tarefa is None:
        return
    tarefa.cancel()
    try:
        await tarefa
    except asyncio.CancelledError:
        pass


async def stop() -> None:
    """Encerra os loops no shutdown, sem deixar task pendente."""
    global _task, _task_outbox
    await _cancelar(_task)
    await _cancelar(_task_outbox)
    _task = None
    _task_outbox = None
