"""Bootstrap de produção: aplica somente os papéis (roles) do SUAS.

Diferente de `scripts.seed`, NÃO cria o tenant fictício "Nova Esperança" nem
domínios — apenas garante que os papéis existam (necessários para o mapeamento
SSO em /internal/sync-user). Idempotente.

Uso:
    python -m scripts.bootstrap_roles
"""

import asyncio

from app.core.database import async_session
from app.core.seeds import seed_roles


async def main() -> None:
    async with async_session() as db:
        roles = await seed_roles(db)
    print(f"Papéis garantidos: {len(roles)}")


if __name__ == "__main__":
    asyncio.run(main())
