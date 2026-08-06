"""Cria o esquema inicial em instalações sem revisões do Alembic."""

import asyncio

from app.core.database import engine
from app.models import Base


async def main() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
