from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import async_session, dispose_sync_engine, engine
from app.core.storage import storage
from app.middleware.json_logging import JSONLogMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        description="GovFrota — Gestão de frota, abastecimentos, estoque de combustíveis e manutenção",
        version=settings.VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Internal-Key"],
    )

    @app.exception_handler(Exception)
    async def catch_all_exception_handler(request: Request, exc: Exception):
        origin = request.headers.get("origin", "")
        headers = {}
        if origin in settings.CORS_ORIGINS:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
        # Nunca retornar stack traces / SQL / dados internos em produção
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc) if settings.DEBUG else "Erro interno do servidor."},
            headers=headers,
        )

    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(JSONLogMiddleware)

    app.include_router(api_router, prefix="/api/govfrota")

    @app.get("/api/govfrota/health")
    async def health():
        """Healthcheck seguro: app + banco + storage. Nunca expõe segredos/hosts."""
        checks = {"app": True, "database": False, "storage": False}
        try:
            async with async_session() as session:
                await session.execute(text("SELECT 1"))
            checks["database"] = True
        except Exception:
            pass
        try:
            checks["storage"] = bool(storage.verify())
        except Exception:
            checks["storage"] = False

        healthy = checks["app"] and checks["database"] and checks["storage"]
        return JSONResponse(
            status_code=200 if healthy else 503,
            content={
                "status": "ok" if healthy else "degraded",
                "app": settings.APP_NAME,
                "version": settings.VERSION,
                "checks": checks,
            },
        )

    @app.on_event("shutdown")
    async def shutdown():
        dispose_sync_engine()
        await engine.dispose()

    return app


app = create_app()
