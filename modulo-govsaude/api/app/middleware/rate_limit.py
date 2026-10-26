"""Rate limit por IP/escopo.

Suficiente para uma instância. Em múltiplas réplicas, a mesma interface pode
ser trocada por Redis sem alterar as rotas.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import settings


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_requests: int | None = None, window: int | None = None):
        super().__init__(app)
        self.max_requests = max_requests or settings.RATE_LIMIT_REQUESTS
        self.window = window or settings.RATE_LIMIT_WINDOW_SECONDS
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    @staticmethod
    def _ip(request: Request) -> str:
        encaminhado = request.headers.get("x-forwarded-for")
        if encaminhado:
            return encaminhado.split(",")[0].strip()
        return request.client.host if request.client else "desconhecido"

    def _chave(self, request: Request) -> str:
        publico = "/publico" in request.url.path or request.url.path.endswith("/auth/login")
        return f"{'publico' if publico else 'interno'}:{self._ip(request)}"

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        chave = self._chave(request)
        limite = (
            settings.PUBLIC_RATE_LIMIT_REQUESTS
            if chave.startswith("publico:")
            else self.max_requests
        )
        agora = time.time()
        hits = self._hits[chave]
        while hits and agora - hits[0] > self.window:
            hits.popleft()
        if len(hits) >= limite:
            espera = int(self.window - (agora - hits[0])) + 1
            return JSONResponse(
                status_code=429,
                media_type="application/problem+json",
                content={
                    "type": "urn:govsaude:erro:limite_requisicoes",
                    "title": "Muitas requisições",
                    "status": 429,
                    "detail": (
                        "Muitas requisições em pouco tempo. "
                        f"Tente novamente em {espera} segundo(s)."
                    ),
                    "instance": request.url.path,
                    "request_id": getattr(request.state, "request_id", None),
                    "codigo": "limite_requisicoes",
                },
                headers={"Retry-After": str(espera)},
            )
        hits.append(agora)
        return await call_next(request)
