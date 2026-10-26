"""Erros no formato Problem Details (RFC 9457).

Todos os erros da API usam ``application/problem+json`` e carregam o
``request_id``. Erros de validação trazem ``errors[]`` com ``campo``,
``mensagem`` e ``codigo_regra`` para orientar a correção no ponto exato.
"""

from __future__ import annotations

import logging
from http import HTTPStatus

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger("govsaude.error")


class AppError(Exception):
    def __init__(
        self,
        detail: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        code: str = "erro_negocio",
        *,
        title: str | None = None,
        errors: list[dict] | None = None,
        extra: dict | None = None,
        headers: dict[str, str] | None = None,
    ):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code
        self.code = code
        self.title = title
        self.errors = errors or []
        self.extra = extra or {}
        self.headers = headers or {}

    def problema(self, request: Request) -> dict:
        body = {
            "type": f"urn:govsaude:erro:{self.code}",
            "title": self.title or HTTPStatus(self.status_code).phrase,
            "status": self.status_code,
            "detail": self.detail,
            "instance": request.url.path,
            "request_id": getattr(request.state, "request_id", None),
            "codigo": self.code,
        }
        if self.errors:
            body["errors"] = self.errors
        if self.extra:
            body.update(self.extra)
        return body


class Unauthenticated(AppError):
    def __init__(self, detail: str = "Sessão não autenticada ou expirada."):
        super().__init__(
            detail,
            status.HTTP_401_UNAUTHORIZED,
            "nao_autenticado",
            headers={"WWW-Authenticate": "Bearer"},
        )


class PermissionDenied(AppError):
    def __init__(self, detail: str = "Seu perfil não permite esta operação."):
        super().__init__(detail, status.HTTP_403_FORBIDDEN, "permissao_negada")


class NotFound(AppError):
    def __init__(self, detail: str = "Registro não encontrado."):
        super().__init__(detail, status.HTTP_404_NOT_FOUND, "nao_encontrado")


class Conflict(AppError):
    def __init__(
        self,
        detail: str,
        *,
        code: str = "conflito",
        extra: dict | None = None,
        errors: list[dict] | None = None,
    ):
        super().__init__(
            detail, status.HTTP_409_CONFLICT, code, extra=extra, errors=errors
        )


class Unprocessable(AppError):
    def __init__(
        self,
        detail: str,
        *,
        code: str = "regra_negocio",
        errors: list[dict] | None = None,
        extra: dict | None = None,
    ):
        super().__init__(
            detail,
            422,
            code,
            errors=errors,
            extra=extra,
        )


class PreconditionFailed(AppError):
    def __init__(self, detail: str, *, code: str = "precondicao_falhou", extra: dict | None = None):
        super().__init__(
            detail, status.HTTP_412_PRECONDITION_FAILED, code, extra=extra
        )


class Locked(AppError):
    def __init__(self, detail: str, *, code: str = "conta_bloqueada", extra: dict | None = None):
        super().__init__(detail, status.HTTP_423_LOCKED, code, extra=extra)


class TooManyRequests(AppError):
    def __init__(self, detail: str, *, retry_after: int = 60):
        super().__init__(
            detail,
            status.HTTP_429_TOO_MANY_REQUESTS,
            "limite_requisicoes",
            headers={"Retry-After": str(retry_after)},
        )


def register_exception_handlers(app: FastAPI) -> None:
    def _resp(request: Request, status_code: int, body: dict, headers: dict | None = None):
        return JSONResponse(
            status_code=status_code,
            content=body,
            media_type="application/problem+json",
            headers=headers,
        )

    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError):
        return _resp(request, exc.status_code, exc.problema(request), exc.headers or None)

    @app.exception_handler(HTTPException)
    async def _http_error(request: Request, exc: HTTPException):
        detalhe = exc.detail if isinstance(exc.detail, str) else "Não foi possível concluir."
        corpo = {
            "type": "urn:govsaude:erro:http",
            "title": HTTPStatus(exc.status_code).phrase,
            "status": exc.status_code,
            "detail": detalhe,
            "instance": request.url.path,
            "request_id": getattr(request.state, "request_id", None),
            "codigo": "http_erro",
        }
        return _resp(request, exc.status_code, corpo, getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        errors = []
        for err in exc.errors():
            loc = [str(p) for p in err.get("loc", []) if p != "body"]
            errors.append(
                {
                    "campo": ".".join(loc) or "corpo",
                    "mensagem": err.get("msg", "Valor inválido."),
                    "codigo_regra": err.get("type", "valor_invalido"),
                }
            )
        corpo = {
            "type": "urn:govsaude:erro:dados_invalidos",
            "title": "Dados inválidos",
            "status": 422,
            "detail": "Os dados enviados não são válidos. Verifique os campos destacados.",
            "instance": request.url.path,
            "request_id": getattr(request.state, "request_id", None),
            "codigo": "dados_invalidos",
            "errors": errors,
        }
        return _resp(request, 422, corpo)

    @app.exception_handler(IntegrityError)
    async def _integrity_error(request: Request, exc: IntegrityError):
        logger.warning("Violação de integridade: %s", exc.__class__.__name__)
        corpo = {
            "type": "urn:govsaude:erro:conflito",
            "title": "Conflito de dados",
            "status": status.HTTP_409_CONFLICT,
            "detail": (
                "Já existe um registro com essas informações ou há vínculo "
                "impedindo a operação."
            ),
            "instance": request.url.path,
            "request_id": getattr(request.state, "request_id", None),
            "codigo": "conflito",
        }
        return _resp(request, status.HTTP_409_CONFLICT, corpo)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        logger.exception("Erro não tratado em %s %s", request.method, request.url.path)
        corpo = {
            "type": "urn:govsaude:erro:interno",
            "title": "Erro interno",
            "status": status.HTTP_500_INTERNAL_SERVER_ERROR,
            "detail": (
                "Ocorreu um erro inesperado. A equipe técnica foi notificada "
                "pelo log do sistema."
            ),
            "instance": request.url.path,
            "request_id": getattr(request.state, "request_id", None),
            "codigo": "erro_interno",
        }
        return _resp(request, status.HTTP_500_INTERNAL_SERVER_ERROR, corpo)
