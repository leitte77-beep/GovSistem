"""Bootstrap idempotente chamado pelo entrypoint: garante os perfis do GovPro."""

import asyncio

from app.core.database import async_session
from app.core.seeds import seed_roles


async def main() -> None:
    async with async_session() as db:
        await seed_roles(db)
        await db.commit()
    print("[bootstrap] Perfis do GovPro garantidos.")


if __name__ == "__main__":
    asyncio.run(main())
