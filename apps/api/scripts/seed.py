#!/usr/bin/env python3
"""Seed script: populates default organization, roles, and act types.

Usage:
    docker compose -f infra/docker-compose.yml exec api python scripts/seed.py
"""

import asyncio

from app.core.database import async_session
from app.core.seeds import run_all_seeds


async def main():
    async with async_session() as db:
        result = await run_all_seeds(db)
    print("Seeds applied successfully:")
    for key, value in result.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    asyncio.run(main())
