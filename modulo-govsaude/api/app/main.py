"""GovSaúde — API da gestão da saúde pública municipal.

Prefixo: ``/api/govsaude/v1`` · saúde: ``/api/govsaude/health``.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.health import router as health_router
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import engine
from app.core.errors import register_exception_handlers
from app.core.redis import fechar_redis
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.request_context import RequestContextMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("govsaude")

API_PREFIX = "/api/govsaude/v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "GovSaúde iniciado — ambiente=%s api=http://%s:%s%s",
        settings.APP_ENV,
        settings.APP_HOST,
        settings.API_PORT,
        API_PREFIX,
    )
    yield
    await fechar_redis()
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_TITLE,
        description=(
            "Backend multi-tenant para secretarias municipais de saúde: "
            "cadastro único, território, agenda, prontuário, programas, "
            "odontologia, estoque, imunização, laboratório, regulação, "
            "faturamento, vigilância sanitária e indicadores da APS."
        ),
        version=settings.VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
        contact={"name": "GovSistem", "url": "https://govsistem.com.br"},
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Internal-Key",
            "X-Request-ID",
            "X-Origem-App",
            "Idempotency-Key",
            "If-Match",
        ],
        expose_headers=["X-Request-ID", "ETag", "Content-Disposition"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(RequestContextMiddleware)

    register_exception_handlers(app)
    app.include_router(api_router, prefix=API_PREFIX)
    app.include_router(health_router, prefix="/api/govsaude")

    @app.get("/", include_in_schema=False)
    async def raiz():
        return {
            "modulo": "GovSaúde",
            "versao": settings.VERSION,
            "documentacao": "/docs",
            "api": API_PREFIX,
            "health": "/api/govsaude/health",
        }

    return app


app = create_app()
