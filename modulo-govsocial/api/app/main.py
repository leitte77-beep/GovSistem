from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import dispose_sync_engine, engine
from app.core.problem_details import register_exception_handlers
from app.middleware import RequestContextMiddleware, SecurityHeadersMiddleware
from app.middleware.rate_limit import RateLimitMiddleware


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        description="GovSocial - Módulo de Assistência Social (SUAS)",
        version=settings.VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Internal-Key", "X-Request-ID"],
    )

    register_exception_handlers(app)

    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(RateLimitMiddleware, max_requests=200, window=60)

    app.include_router(api_router, prefix="/api/govsocial/v1")

    @app.get("/api/govsocial/health")
    async def health():
        return {
            "status": "ok",
            "app": settings.APP_NAME,
            "version": settings.VERSION,
        }

    @app.on_event("shutdown")
    async def shutdown():
        dispose_sync_engine()
        await engine.dispose()

    return app


app = create_app()
