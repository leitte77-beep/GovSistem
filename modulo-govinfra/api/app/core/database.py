"""Sessões do banco (async) — mesmo padrão dos demais módulos do sistema."""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

# SQLite (suíte de testes) não aceita os parâmetros de pool do PostgreSQL.
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
    """SQLite não implementa SELECT ... FOR UPDATE.

    Os serviços que dependem de bloqueio pessimista (banco de horas, reserva de
    equipamento) consultam esta função: no PostgreSQL travam a linha; no SQLite
    contam com a serialização de escrita do próprio arquivo.
    """
    return not _is_sqlite
