"""Sessões assíncronas do banco.

PostgreSQL 16 é o banco de produção. A suíte unitária usa SQLite para ser
rápida; os testes marcados ``postgres`` exercitam triggers, partições e
full-text no banco real.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

_engine_options = (
    {}
    if _is_sqlite
    else {
        "pool_pre_ping": True,
        "pool_size": 10,
        "max_overflow": 20,
        "pool_recycle": 3600,
    }
)

engine = create_async_engine(settings.DATABASE_URL, echo=False, **_engine_options)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


def suporta_bloqueio_linha() -> bool:
    return not _is_sqlite


async def preparar_schema_referencia(conn) -> None:
    """Cria o schema ``referencia`` no PostgreSQL (idempotente)."""
    if not _is_sqlite:
        await conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{settings.REFERENCIA_SCHEMA}"'))
