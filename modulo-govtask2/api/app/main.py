from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core import storage
from app.core.config import settings
from app.core.database import async_session, dispose_sync_engine, engine
from app.middleware.json_logging import JSONLogMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        description=(
            "GovTask — do pedido do Prefeito ao pagamento. "
            "O Assessor encaminha, o setor devolve, o Prefeito acompanha."
        ),
        version=settings.VERSION,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Internal-Key"],
        expose_headers=["X-Total-Count"],
    )

    @app.exception_handler(Exception)
    async def erro_inesperado(request: Request, exc: Exception):
        origin = request.headers.get("origin", "")
        headers = {}
        if origin in settings.CORS_ORIGINS:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
        # Nunca devolve stack trace nem SQL em produção.
        return JSONResponse(
            status_code=500,
            content={
                "detail": str(exc) if settings.DEBUG else "Erro interno do servidor."
            },
            headers=headers,
        )

    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(JSONLogMiddleware)

    app.include_router(api_router, prefix="/api/govtask")

    @app.get("/api/govtask/health")
    async def health():
        checks = {"app": True, "database": False, "storage": False}
        try:
            async with async_session() as session:
                await session.execute(text("SELECT 1"))
            checks["database"] = True
        except Exception:
            pass
        checks["storage"] = storage.verificar()

        saudavel = all(checks.values())
        return JSONResponse(
            status_code=200 if saudavel else 503,
            content={
                "status": "ok" if saudavel else "degraded",
                "app": settings.APP_NAME,
                "version": settings.VERSION,
                "checks": checks,
            },
        )

    tarefas: list = []

    @app.on_event("startup")
    async def startup():
        if settings.RESUMO_DIARIO_ATIVO:
            import asyncio

            from app.services.resumo_diario import laco

            tarefas.append(asyncio.create_task(laco()))

    @app.on_event("shutdown")
    async def shutdown():
        for tarefa in tarefas:
            tarefa.cancel()
        dispose_sync_engine()
        await engine.dispose()

    return app


app = create_app()
