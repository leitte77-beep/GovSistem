"""Middlewares: contexto de requisição, cabeçalhos de segurança e rate limiting."""

import json
import logging
import time
import uuid
from collections import defaultdict, deque
from typing import Deque, Dict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings

logger = logging.getLogger("govdoc.request")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Gera/propaga o identificador de correlação e emite log estruturado."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        request.state.request_id = request_id
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.error(
                json.dumps(
                    {
                        "evento": "requisicao_falhou",
                        "request_id": request_id,
                        "metodo": request.method,
                        "rota": request.url.path,
                        "ambiente": settings.APP_ENV,
                    }
                )
            )
            raise
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        if request.url.path not in {"/api/govdoc/health", "/api/govdoc/health/live"}:
            logger.info(
                json.dumps(
                    {
                        "evento": "requisicao",
                        "request_id": request_id,
                        "metodo": request.method,
                        "rota": request.url.path,
                        "status": response.status_code,
                        "duracao_ms": duration_ms,
                        "servico": "govdoc-api",
                        "ambiente": settings.APP_ENV,
                    }
                )
            )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy", "geolocation=(), microphone=(), camera=()"
        )
        response.headers.setdefault("X-XSS-Protection", "0")
        if settings.is_production:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Janela deslizante em memória.

    Suficiente para uma instância; com várias réplicas, trocar por Redis
    (a chave e a janela já estão isoladas aqui)."""

    def __init__(self, app, max_requests: int | None = None, window: int | None = None):
        super().__init__(app)
        self.max_requests = max_requests or settings.RATE_LIMIT_REQUESTS
        self.window = window or settings.RATE_LIMIT_WINDOW_SECONDS
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)

    def _key(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        ip = forwarded.split(",")[0].strip() if forwarded else (
            request.client.host if request.client else "desconhecido"
        )
        scope = "externo" if request.url.path.startswith("/api/govdoc/v1/publico") else "interno"
        return f"{scope}:{ip}"

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        key = self._key(request)
        limit = (
            settings.EXTERNAL_RATE_LIMIT_REQUESTS
            if key.startswith("externo:")
            else self.max_requests
        )
        now = time.time()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if len(hits) >= limit:
            retry = int(self.window - (now - hits[0])) + 1
            return JSONResponse(
                status_code=429,
                content={
                    "erro": "limite_requisicoes",
                    "mensagem": (
                        "Muitas requisições em pouco tempo. "
                        f"Tente novamente em {retry} segundo(s)."
                    ),
                },
                headers={"Retry-After": str(retry)},
            )
        hits.append(now)
        return await call_next(request)
