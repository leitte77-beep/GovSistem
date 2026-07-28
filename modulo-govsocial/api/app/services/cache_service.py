"""Cache service — Redis-based transparent caching for async queries.

TTLs configuráveis por tipo:
  - dashboard: 300s  (5 min)
  - listagem:  120s  (2 min)
  - pesada:    600s  (10 min)

Fallback: se Redis indisponível, função executa normalmente sem cache.
"""

import functools
import hashlib
import inspect
import json
import logging
from typing import Any, Callable

from app.core.redis import get_redis

logger = logging.getLogger("govsocial.cache")

CACHE_TTLS = {
    "dashboard": 300,
    "listagem": 120,
    "pesada": 600,
}

async def cache_get(key: str) -> Any | None:
    redis = await get_redis()
    if redis is None:
        return None
    try:
        value = await redis.get(key)
        if value is not None:
            return json.loads(value)
    except Exception:
        logger.warning("cache_get falhou para key=%s", key, exc_info=True)
    return None


async def cache_set(key: str, value: Any, ttl: int) -> None:
    redis = await get_redis()
    if redis is None:
        return
    try:
        await redis.setex(key, ttl, json.dumps(value, default=str))
    except Exception:
        logger.warning("cache_set falhou para key=%s", key, exc_info=True)


async def invalidate_cache(prefix: str) -> int:
    """Invalida todas as chaves com o prefixo informado.

    Retorna número de chaves removidas.
    """
    redis = await get_redis()
    if redis is None:
        return 0
    try:
        pattern = f"cache:{prefix}:*"
        cursor = 0
        deleted = 0
        while True:
            cursor, keys = await redis.scan(cursor, match=pattern, count=100)
            if keys:
                deleted += await redis.delete(*keys)
            if cursor == 0:
                break
        if deleted:
            logger.info("cache invalidated: %s (%d keys)", prefix, deleted)
        return deleted
    except Exception:
        logger.warning("invalidate_cache falhou para prefix=%s", prefix, exc_info=True)
        return 0


def _build_cache_args(func: Callable, skip_args: tuple[str, ...], args, kwargs) -> dict:
    """Constrói um dict de argumentos relevantes para a chave de cache,
    ignorando argumentos dinâmicos (db, user, request, etc.).
    """
    sig = inspect.signature(func)
    params = sig.parameters
    bound = sig.bind(*args, **kwargs)
    bound.apply_defaults()

    cache_args = {}
    for name, value in bound.arguments.items():
        if name in skip_args:
            continue
        if name == "self":
            continue
        cache_args[name] = str(value)
    # Ordena para determinismo
    return dict(sorted(cache_args.items()))


def cached(
    prefix: str,
    ttl_seconds: int | None = None,
    ttl_type: str | None = None,
    skip_args: tuple[str, ...] = (),
):
    """Decorator para cache transparente de funções async.

    Args:
        prefix: Prefixo da chave de cache (ex: 'dashboard', 'families').
        ttl_seconds: TTL fixo em segundos. Se omitido, usa ``ttl_type``.
        ttl_type: Tipo de TTL configurável (ex: 'dashboard', 'listagem', 'pesada').
        skip_args: Nomes de parâmetros a ignorar na chave de cache
                   (ex: ('db', 'user') — sessions e objetos DI por requisição).

    A função decorada deve ser async.
    """
    ttl = ttl_seconds or CACHE_TTLS.get(ttl_type or "listagem", 120)

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            raw = json.dumps(
                _build_cache_args(func, skip_args, args, kwargs),
                sort_keys=True,
            )
            digest = hashlib.sha256(raw.encode()).hexdigest()[:24]
            key = f"cache:{prefix}:{digest}"

            cached_value = await cache_get(key)
            if cached_value is not None:
                return cached_value
            result = await func(*args, **kwargs)
            await cache_set(key, result, ttl)
            return result

        return wrapper

    return decorator
