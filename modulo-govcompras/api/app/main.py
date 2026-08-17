"""GovCompras — Gestão Integrada de Compras, Licitações e Contratos.

Ponto de entrada da aplicação. As rotas ficam sob `/api/govcompras/v1`,
seguindo o mesmo padrão dos demais módulos do sistema (govdoc, govinfra,
govsocial, chatgov).
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.health import router as health_router
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import engine
from app.core.errors import register_exception_handlers
from app.core.middleware import RateLimitMiddleware, RequestContextMiddleware, SecurityHeadersMiddleware

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("govcompras")

API_PREFIX = "/api/govcompras/v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "GovCompras iniciado — ambiente=%s api=http://%s:%s%s",
        settings.APP_ENV,
        settings.APP_HOST,
        settings.API_PORT,
        API_PREFIX,
    )
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_TITLE,
        description=(
            "Gestão integrada de compras, licitações e contratos: da necessidade "
            "da secretaria até o encerramento ou renovação do contrato."
        ),
        version=settings.VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Internal-Key", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(RequestContextMiddleware)

    register_exception_handlers(app)

    app.include_router(api_router, prefix=API_PREFIX)
    app.include_router(health_router, prefix="/api/govcompras")

    @app.get("/", include_in_schema=False)
    async def raiz():
        return {
            "modulo": "GovCompras — Gestão Integrada de Compras, Licitações e Contratos",
            "versao": settings.VERSION,
            "documentacao": "/docs",
            "api": API_PREFIX,
        }

    return app


app = create_app()
