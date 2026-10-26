"""Contexto de requisição e log estruturado sem dado sensível."""

from __future__ import annotations

import json
import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.config import settings

logger = logging.getLogger("govsaude.request")

_ROTAS_SILENCIOSAS = {
    "/api/govsaude/health",
    "/api/govsaude/health/live",
    "/api/govsaude/health/ready",
}


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        request.state.request_id = request_id
        inicio = time.perf_counter()
        try:
            resposta = await call_next(request)
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
        resposta.headers["X-Request-ID"] = request_id
        if request.url.path not in _ROTAS_SILENCIOSAS:
            logger.info(
                json.dumps(
                    {
                        "evento": "requisicao",
                        "request_id": request_id,
                        "metodo": request.method,
                        "rota": request.url.path,
                        "status": resposta.status_code,
                        "duracao_ms": round((time.perf_counter() - inicio) * 1000, 2),
                        "servico": "govsaude-api",
                        "ambiente": settings.APP_ENV,
                    }
                )
            )
        return resposta
