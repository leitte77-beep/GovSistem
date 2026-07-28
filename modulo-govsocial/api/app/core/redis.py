"""Redis connection pool for pub/sub and ephemeral storage."""

import logging
from typing import Optional

import redis.asyncio as aioredis
from redis.asyncio import Redis

from app.core.config import settings

logger = logging.getLogger("govsocial.redis")

_redis: Optional[Redis] = None


async def get_redis() -> Redis:
    """Retorna conexão Redis compartilhada. Cria se ainda não existir."""
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            max_connections=20,
        )
        try:
            await _redis.ping()
            logger.info("Redis conectado: %s", settings.REDIS_URL)
        except Exception:
            logger.warning("Redis indisponível em %s — funcionalidades em tempo real desabilitadas", settings.REDIS_URL)
            _redis = None
    return _redis


async def close_redis() -> None:
    """Fecha a conexão Redis no shutdown."""
    global _redis
    if _redis:
        await _redis.close()
        _redis = None
        logger.info("Redis desconectado")
