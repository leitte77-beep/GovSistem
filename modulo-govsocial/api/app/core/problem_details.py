"""Tratamento de erros no formato RFC 9457 (Problem Details).

Nunca vaza stack trace, nomes de tabela ou dado pessoal.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings

logger = logging.getLogger("govsocial.errors")

CONTENT_TYPE = "application/problem+json"

_TITLES = {
    400: "Requisição inválida",
    401: "Não autenticado",
    403: "Acesso negado",
    404: "Recurso não encontrado",
    409: "Conflito",
    422: "Erro de validação",
    429: "Requisições em excesso",
    500: "Erro interno",
    503: "Serviço indisponível",
}


def _problem(
    request: Request,
    status_code: int,
    detail: str,
    *,
    extra: dict | None = None,
) -> JSONResponse:
    body = {
        "type": "about:blank",
        "title": _TITLES.get(status_code, "Erro"),
        "status": status_code,
        "detail": detail,
        "instance": request.url.path,
    }
    if extra:
        body.update(extra)

    headers = {}
    origin = request.headers.get("origin", "")
    if origin in settings.CORS_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"

    return JSONResponse(
        status_code=status_code,
        content=body,
        media_type=CONTENT_TYPE,
        headers=headers,
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else "Erro"
        return _problem(request, exc.status_code, detail)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ):
        errors = [
            {
                "field": ".".join(str(p) for p in e.get("loc", []) if p != "body"),
                "message": e.get("msg", ""),
            }
            for e in exc.errors()
        ]
        return _problem(
            request,
            422,
            "Um ou mais campos são inválidos.",
            extra={"errors": errors},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled error on %s", request.url.path)
        detail = str(exc) if settings.DEBUG else "Ocorreu um erro interno."
        return _problem(request, 500, detail)
