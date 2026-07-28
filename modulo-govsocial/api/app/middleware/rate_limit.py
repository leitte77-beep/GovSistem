"""Rate limiting via Redis (sliding-window) com fallback em memória."""

import time
from collections import defaultdict
from typing import Optional

from redis.asyncio import Redis
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting por IP com sliding window. Usa Redis se disponivel;
    fallback para memoria local (single-worker apenas)."""

    MAX_REQUESTS = 100
    WINDOW = 60

    def __init__(self, app, max_requests: int = 100, window: int = 60):
        super().__init__(app)
        self.MAX_REQUESTS = max_requests
        self.WINDOW = window
        self._buckets: dict[str, list[float]] = defaultdict(list)
        self._redis: Optional[Redis] = None

    async def _get_redis(self) -> Optional[Redis]:
        if self._redis is None:
            try:
                from app.core.redis import get_redis
                self._redis = await get_redis()
            except Exception:
                self._redis = False
        return self._redis if self._redis is not False else None

    async def _redis_check(self, client_key: str) -> bool:
        """Retorna True se o request deve ser permitido (sliding window via sorted set)."""
        r = await self._get_redis()
        if r is None:
            return self._mem_check(client_key)
        now = time.time()
        window_start = now - self.WINDOW
        pipe = r.pipeline()
        pipe.zremrangebyscore(client_key, "-inf", window_start)
        pipe.zcard(client_key)
        pipe.zadd(client_key, {str(now): now})
        pipe.expire(client_key, self.WINDOW + 1)
        _, count, *_ = await pipe.execute()
        return count < self.MAX_REQUESTS

    def _mem_check(self, client_key: str) -> bool:
        now = time.time()
        bucket = self._buckets[client_key]
        bucket[:] = [t for t in bucket if now - t < self.WINDOW]
        if len(bucket) >= self.MAX_REQUESTS:
            return False
        bucket.append(now)
        return True

    async def dispatch(self, request: Request, call_next):
        if request.scope.get("type") == "websocket":
            return await call_next(request)
        forwarded = request.headers.get("x-forwarded-for")
        client_ip = forwarded.split(",")[0].strip() if forwarded else (
            request.client.host if request.client else "unknown"
        )
        client_key = f"ratelimit:{client_ip}"

        allowed = await self._redis_check(client_key)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "type": "https://tools.ietf.org/html/rfc6585#section-4",
                    "title": "Too Many Requests",
                    "detail": "Limite de requisições excedido. Aguarde alguns segundos.",
                    "status": 429,
                },
                headers={"Retry-After": str(self.WINDOW)},
            )

        return await call_next(request)
