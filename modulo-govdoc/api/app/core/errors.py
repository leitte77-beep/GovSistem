"""Tratamento central de erros.

Regra: o usuário final recebe uma mensagem clara em português; o detalhe técnico
(stack trace) vai só para o log, correlacionado pelo request id.
"""

import logging
import uuid

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger("govdoc.error")


class AppError(Exception):
    """Erro de negócio com mensagem pronta para o usuário."""

    def __init__(self, message: str, status_code: int = 400, code: str = "erro_negocio"):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


class PermissionDenied(AppError):
    def __init__(self, message: str = "Você não possui permissão para acessar este recurso."):
        super().__init__(message, status.HTTP_403_FORBIDDEN, "permissao_negada")


class NotFound(AppError):
    def __init__(self, message: str = "Registro não encontrado."):
        super().__init__(message, status.HTTP_404_NOT_FOUND, "nao_encontrado")


class Conflict(AppError):
    def __init__(self, message: str, code: str = "conflito"):
        super().__init__(message, status.HTTP_409_CONFLICT, code)


def _payload(request: Request, code: str, message: str, extra: dict | None = None) -> dict:
    body = {
        "erro": code,
        "mensagem": message,
        "correlacao": getattr(request.state, "request_id", None) or uuid.uuid4().hex,
    }
    if extra:
        body.update(extra)
    return body


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status_code,
            content=_payload(request, exc.code, exc.message),
        )

    @app.exception_handler(HTTPException)
    async def _http_error(request: Request, exc: HTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else "Não foi possível concluir."
        return JSONResponse(
            status_code=exc.status_code,
            content=_payload(request, "http_erro", detail),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        campos = []
        for err in exc.errors():
            loc = ".".join(str(p) for p in err.get("loc", []) if p != "body")
            campos.append({"campo": loc, "detalhe": err.get("msg", "")})
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_payload(
                request,
                "dados_invalidos",
                "Os dados enviados não são válidos. Verifique os campos destacados.",
                {"campos": campos},
            ),
        )

    @app.exception_handler(IntegrityError)
    async def _integrity_error(request: Request, exc: IntegrityError):
        logger.warning("Violação de integridade: %s", exc, exc_info=False)
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=_payload(
                request,
                "conflito",
                "Já existe um registro com essas informações ou há vínculo impedindo a operação.",
            ),
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        logger.exception("Erro não tratado em %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_payload(
                request,
                "erro_interno",
                "Ocorreu um erro inesperado. A equipe técnica foi notificada pelo log do sistema.",
            ),
        )
