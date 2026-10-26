"""Tarefas periódicas de manutenção (partições, expurgo, retenção)."""

from __future__ import annotations

import asyncio
import logging
from datetime import date

from sqlalchemy import delete, func, select, text

from app.core.database import async_session
from app.core.security import agora
from app.models.nucleo import IdempotencyKey
from app.tasks.celery_app import celery_app

logger = logging.getLogger("govsaude.tasks.manutencao")


async def _manter_particoes() -> None:
    async with async_session() as db:
        try:
            await db.execute(
                text(
                    "SELECT govsaude_criar_particao_auditoria("
                    "(CURRENT_DATE + interval '2 months')::date)"
                )
            )
            await db.execute(
                text(
                    "SELECT govsaude_criar_particao_auditoria("
                    "(CURRENT_DATE + interval '3 months')::date)"
                )
            )
            await db.execute(
                text(
                    "SELECT govsaude_criar_particao_integracao("
                    "(CURRENT_DATE + interval '2 months')::date)"
                )
            )
            await db.execute(
                text(
                    "SELECT govsaude_criar_particao_integracao("
                    "(CURRENT_DATE + interval '3 months')::date)"
                )
            )
            await db.commit()
            logger.info("Partições de auditoria verificadas")
        except Exception:  # noqa: BLE001 - SQLite/dev não tem a função
            await db.rollback()
            logger.debug("Função de partição indisponível neste banco")


@celery_app.task(name="govsaude.manter_particoes_auditoria")
def manter_particoes_auditoria() -> None:
    asyncio.run(_manter_particoes())


async def _expurgar_idempotency() -> int:
    async with async_session() as db:
        resultado = await db.execute(
            delete(IdempotencyKey).where(IdempotencyKey.expires_at < agora())
        )
        await db.commit()
        return int(resultado.rowcount or 0)


@celery_app.task(name="govsaude.expurgar_idempotency")
def expurgar_idempotency() -> int:
    return asyncio.run(_expurgar_idempotency())


async def _resumo() -> dict:
    async with async_session() as db:
        expirados = await db.scalar(
            select(func.count()).select_from(IdempotencyKey).where(
                IdempotencyKey.expires_at < agora()
            )
        )
        return {"idempotency_expirados": int(expirados or 0), "data": date.today().isoformat()}


@celery_app.task(name="govsaude.resumo_manutencao")
def resumo_manutencao() -> dict:
    return asyncio.run(_resumo())
