#!/usr/bin/env python3
"""Seed script: populates default organization, roles, and act types."""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import async_session, engine
from app.core.seeds import run_all_seeds
from app.models.base import Base


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as db:
        result = await run_all_seeds(db)
    print("Seeds applied successfully:")
    for key, value in result.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    asyncio.run(main())
