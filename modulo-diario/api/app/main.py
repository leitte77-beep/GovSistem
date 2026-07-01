from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api.public_v1.router import router as public_v1_router
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import dispose_sync_engine
from app.core.sentry import init_sentry
from app.middleware.audit import audit_middleware
from app.middleware.json_logging import JSONLogMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])


def create_app() -> FastAPI:
    init_sentry()

    app = FastAPI(
        title=settings.APP_NAME,
        description="Diário Oficial Eletrônico - API Backend",
        version=settings.VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


def create_app() -> FastAPI:
    init_sentry()

    app = FastAPI(
        title=settings.APP_NAME,
        description="Diário Oficial Eletrônico - API Backend",
        version=settings.VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Internal-Key", "X-Tenant-Slug"],
    )

    @app.exception_handler(Exception)
    async def catch_all_exception_handler(request: Request, exc: Exception):
        origin = request.headers.get("origin", "")
        headers = {}
        if origin in settings.CORS_ORIGINS:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc) if settings.DEBUG else "Internal server error"},
            headers=headers,
        )

    app.middleware("http")(audit_middleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(JSONLogMiddleware)

    app.include_router(api_router, prefix="/api/v1")
    app.include_router(public_v1_router)

    @app.on_event("shutdown")
    async def shutdown():
        dispose_sync_engine()

    return app


app = create_app()
