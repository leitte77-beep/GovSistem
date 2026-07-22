from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import dispose_sync_engine
from app.middleware.correlation import CorrelationIdMiddleware
from app.middleware.sanitize import SanitizeLogMiddleware
from app.services.sanitize import SanitizingFilter

import logging

logging.getLogger("saas").addFilter(SanitizingFilter())

limiter = Limiter(key_func=get_remote_address)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        description="GovSistem - Central de Controle de Modulos",
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
        allow_headers=["Content-Type", "Authorization", "X-Internal-Key", "X-Correlation-ID"],
    )

    app.add_middleware(CorrelationIdMiddleware)
    app.add_middleware(SanitizeLogMiddleware)

    @app.exception_handler(Exception)
    async def catch_all_exception_handler(request: Request, exc: Exception):
        import logging
        _logger = logging.getLogger("saas")
        _logger.error("Unhandled exception: %s", exc, exc_info=True)
        origin = request.headers.get("origin", "")
        headers = {}
        if origin in settings.CORS_ORIGINS:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
            headers=headers,
        )

    app.include_router(api_router, prefix="/api/v1")

    @app.get("/api/v1/health")
    async def health():
        import logging as _logging
        _log = _logging.getLogger("saas.health")
        modules_status = {}
        module_checks: dict[str, tuple[str, str]] = {
            "diario": (settings.DIARIO_MODULE_INTERNAL_API_URL, "/api/v1/health"),
            "chatgov": (settings.CHATGOV_MODULE_INTERNAL_API_URL, "/api/health"),
            "govtask": (settings.GOVTASK_MODULE_INTERNAL_API_URL, "/api/govtask/health"),
            "govsocial": (settings.GOVSOCIAL_MODULE_INTERNAL_API_URL, "/api/govsocial/health"),
            "govavalia": (settings.GOVAVALIA_MODULE_INTERNAL_API_URL, "/avalia/health"),
        }
        for name, (base_url, health_path) in module_checks.items():
            if not base_url:
                continue
            try:
                import httpx
                async with httpx.AsyncClient(timeout=5) as client:
                    resp = await client.get(f"{base_url}{health_path}")
                modules_status[name] = "ok" if resp.status_code == 200 else "degraded"
            except Exception:
                modules_status[name] = "unreachable"
                _log.warning("Module %s health check failed", name)

        return {
            "status": "ok",
            "service": "govsistem",
            "modules": modules_status,
        }

    @app.on_event("shutdown")
    async def shutdown():
        dispose_sync_engine()

    return app


app = create_app()
