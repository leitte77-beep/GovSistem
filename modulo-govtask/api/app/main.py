from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import dispose_sync_engine, engine
from app.middleware.audit import audit_middleware
from app.middleware.json_logging import JSONLogMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        description="GovTask - Gestão de Convênios Públicos",
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
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc) if settings.DEBUG else "Internal server error"},
            headers=headers,
        )

    app.middleware("http")(audit_middleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(JSONLogMiddleware)

    app.include_router(api_router, prefix="/api/govtask")

    @app.get("/api/govtask/health")
    async def health():
        return {"status": "ok", "app": settings.APP_NAME, "version": settings.VERSION}

    @app.on_event("shutdown")
    async def shutdown():
        dispose_sync_engine()
        await engine.dispose()

    return app


app = create_app()
