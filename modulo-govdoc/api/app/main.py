"""GovDoc — API de Gestão de Documentos.

Ponto de entrada da aplicação. As rotas ficam sob `/api/govdoc/v1`, seguindo o
mesmo padrão dos demais módulos do sistema (govsocial, govtask, chatgov).
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.health import router as health_router
from app.api.v1.internal import router as internal_router
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import engine
from app.core.errors import register_exception_handlers
from app.core.middleware import (
    RateLimitMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
)

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("govdoc")

API_PREFIX = "/api/govdoc/v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    tarefa = None
    if settings.SCHEDULER_ENABLED and settings.APP_ENV != "test":
        from app.services.scheduler import loop as scheduler_loop

        tarefa = asyncio.create_task(scheduler_loop())
        logger.info("Agendador de tarefas iniciado")

    logger.info(
        "GovDoc iniciado — ambiente=%s api=http://%s:%s%s",
        settings.APP_ENV,
        settings.APP_HOST,
        settings.API_PORT,
        API_PREFIX,
    )
    yield

    if tarefa is not None:
        tarefa.cancel()
        try:
            await tarefa
        except asyncio.CancelledError:
            pass
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_TITLE,
        description=(
            "Gestão, compartilhamento, versionamento e backup de documentos "
            "institucionais."
        ),
        version=settings.VERSION,
        docs_url=(None if not settings.DEBUG else "/docs"),
        redoc_url=(None if not settings.DEBUG else "/redoc"),
        openapi_url=(None if not settings.DEBUG else "/openapi.json"),
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Content-Type",
            "Authorization",
            "X-Internal-Key",
            "X-Request-ID",
        ],
        expose_headers=["X-Request-ID", "Content-Disposition"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(RequestContextMiddleware)

    register_exception_handlers(app)

    app.include_router(api_router, prefix=API_PREFIX)
    app.include_router(internal_router, prefix="/api/govdoc")
    app.include_router(health_router, prefix="/api/govdoc")

    @app.get("/", include_in_schema=False)
    async def raiz():
        return {
            "modulo": "GovDoc — Gestão de Documentos",
            "versao": settings.VERSION,
            "documentacao": "/docs",
            "api": API_PREFIX,
        }

    return app


app = create_app()
