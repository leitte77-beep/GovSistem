"""Executa os seeds do GovSocial (roles, tenant Nova Esperança, domínios nacionais).

Uso:
    python -m scripts.seed
"""

import asyncio

from app.core.database import async_session
from app.core.seeds import run_all_seeds


async def main() -> None:
    async with async_session() as db:
        result = await run_all_seeds(db)
    print("Seeds aplicados:")
    for key, value in result.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    asyncio.run(main())
