"""GovInfra — API da Secretaria Municipal de Infraestrutura.

Ponto de entrada da aplicação. As rotas ficam sob `/api/govinfra/v1`, seguindo
o mesmo padrão dos demais módulos do sistema (govdoc, govsocial, chatgov).
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.health import router as health_router
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
logger = logging.getLogger("govinfra")

API_PREFIX = "/api/govinfra/v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    tarefa = None
    if settings.SCHEDULER_ENABLED and settings.APP_ENV != "test":
        from app.services.scheduler import loop as scheduler_loop

        tarefa = asyncio.create_task(scheduler_loop())
        logger.info("Agendador de tarefas iniciado")

    logger.info(
        "GovInfra iniciado — ambiente=%s api=http://%s:%s%s",
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
            "Módulo de gestão dos serviços, equipamentos e atendimentos da "
            "Secretaria Municipal de Infraestrutura — caçambas, Porteira "
            "Adentro, máquinas, veículos, combustível e manutenções."
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
        allow_headers=[
            "Content-Type",
            "Authorization",
            "X-Internal-Key",
            "X-Request-ID",
            "X-Origem-App",
            "X-Idempotency-Key",
        ],
        expose_headers=["X-Request-ID", "Content-Disposition"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(RequestContextMiddleware)

    register_exception_handlers(app)

    app.include_router(api_router, prefix=API_PREFIX)
    app.include_router(health_router, prefix="/api/govinfra")

    @app.get("/", include_in_schema=False)
    async def raiz():
        return {
            "modulo": "GovInfra — Secretaria Municipal de Infraestrutura",
            "versao": settings.VERSION,
            "documentacao": "/docs",
            "api": API_PREFIX,
        }

    return app


app = create_app()
