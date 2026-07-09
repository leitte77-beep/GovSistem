"""Rate limiting simples baseado em IP — compatível com deploy em produção."""
import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware de rate limiting por IP. Bloqueia se > MAX_REQUESTS em WINDOW segundos."""

    MAX_REQUESTS = 100
    WINDOW = 60  # segundos

    def __init__(self, app, max_requests: int = 100, window: int = 60):
        super().__init__(app)
        self.MAX_REQUESTS = max_requests
        self.WINDOW = window
        self._buckets: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()

        bucket = self._buckets[client_ip]
        bucket[:] = [t for t in bucket if now - t < self.WINDOW]

        if len(bucket) >= self.MAX_REQUESTS:
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

        bucket.append(now)
        return await call_next(request)
