"""Redis pub/sub para SSE e cache (opcional em desenvolvimento)."""

from __future__ import annotations

import json
from typing import Any

import redis.asyncio as redis

from app.core.config import settings

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(settings.redis_url, decode_responses=True)
    return _client


async def fechar_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def canal_tenant(tenant_id: str, estabelecimento_id: str, setor_id: str) -> str:
    return f"govsaude:{tenant_id}:{estabelecimento_id}:{setor_id}"


async def publicar(
    tenant_id: str, estabelecimento_id: str, setor_id: str, evento: dict[str, Any]
) -> None:
    await get_redis().publish(
        canal_tenant(str(tenant_id), str(estabelecimento_id), str(setor_id)),
        json.dumps(evento, ensure_ascii=False),
    )
