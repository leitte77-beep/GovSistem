"""Middlewares: contexto da requisição, cabeçalhos de segurança e rate limit."""

import json
import logging
import time
import uuid
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings

logger = logging.getLogger("govinfra.request")

_ROTAS_SILENCIOSAS = {
    "/api/govinfra/health",
    "/api/govinfra/health/live",
    "/api/govinfra/health/ready",
}


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Gera/propaga o identificador de correlação e emite log estruturado.

    O mesmo identificador é gravado na auditoria, o que permite ligar um
    registro de auditoria à requisição que o originou.
    """

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
        response.headers["X-Request-ID"] = request_id
        if request.url.path not in _ROTAS_SILENCIOSAS:
            logger.info(
                json.dumps(
                    {
                        "evento": "requisicao",
                        "request_id": request_id,
                        "metodo": request.method,
                        "rota": request.url.path,
                        "status": response.status_code,
                        "duracao_ms": round((time.perf_counter() - started) * 1000, 2),
                        "servico": "govinfra-api",
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
        response.headers.setdefault("Permissions-Policy", "microphone=(), camera=()")
        response.headers.setdefault("X-XSS-Protection", "0")
        if settings.is_production:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Janela deslizante em memória.

    Suficiente para uma instância; com várias réplicas trocar por Redis — a
    chave e a janela já estão isoladas aqui.
    """

    def __init__(self, app, max_requests: int | None = None, window: int | None = None):
        super().__init__(app)
        self.max_requests = max_requests or settings.RATE_LIMIT_REQUESTS
        self.window = window or settings.RATE_LIMIT_WINDOW_SECONDS
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _key(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        ip = (
            forwarded.split(",")[0].strip()
            if forwarded
            else (request.client.host if request.client else "desconhecido")
        )
        escopo = "publico" if "/publico" in request.url.path else "interno"
        return f"{escopo}:{ip}"

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        chave = self._key(request)
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
                content={
                    "erro": "limite_requisicoes",
                    "mensagem": (
                        "Muitas requisições em pouco tempo. "
                        f"Tente novamente em {espera} segundo(s)."
                    ),
                },
                headers={"Retry-After": str(espera)},
            )
        hits.append(agora)
        return await call_next(request)
