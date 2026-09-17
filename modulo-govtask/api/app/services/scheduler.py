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
from app.services.notifications import verificar_prazos
from app.services.prazos import varrer_organizacao
from app.services.prazos import varrer_organizacao

logger = logging.getLogger("govtask.scheduler")

_task: asyncio.Task | None = None


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
            resultado = {**resultado, **{f"legado_{k}": v for k, v in legado.items()}}
            if any(resultado.values()):
                logger.info(
                    "prazos verificados",
                    extra={"organization_id": str(organization_id), **resultado},
                )
            # Motor v2: alertas das demandas, com escalonamento configurável.
            async with async_session() as db:
                alertas = await varrer_organizacao(db, organization_id)
            if alertas.get("alertas_criados") or alertas.get("alertas_resolvidos"):
                logger.info(
                    "alertas atualizados",
                    extra={"organization_id": str(organization_id), **alertas},
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


def start() -> None:
    """Sobe o loop, se habilitado. Chamado uma vez, no startup."""
    global _task
    if not settings.DEADLINE_CHECK_ENABLED:
        logger.info("verificação automática de prazos desabilitada")
        return
    if _task and not _task.done():
        return
    _task = asyncio.create_task(_loop(), name="govtask-verificar-prazos")
    logger.info(
        "verificação automática de prazos a cada %s min",
        settings.DEADLINE_CHECK_INTERVAL_MINUTES,
    )


async def stop() -> None:
    """Encerra o loop no shutdown, sem deixar task pendente."""
    global _task
    if _task is None:
        return
    _task.cancel()
    try:
        await _task
    except asyncio.CancelledError:
        pass
    finally:
        _task = None
