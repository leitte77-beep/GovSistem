import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api.public_v1.router import router as public_v1_router
from app.api.public_v1.semantic import router as public_semantic_router
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import dispose_sync_engine
from app.core.sentry import init_sentry
from app.middleware.audit import audit_middleware
from app.middleware.json_logging import JSONLogMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware

logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])


async def _verify_schema() -> None:
    """Validate the schema against the Alembic head revision.

    The schema is owned exclusively by Alembic (``alembic/versions``); this
    function never runs DDL. It enforces a fail-closed contract: any pending
    migration causes the process to exit non-zero with a clear message, so a
    partially-migrated database cannot come up serving traffic.

    A new database (no tables yet) must be brought up by running
    ``alembic upgrade head`` from the deployment script before starting the
    API; this function does not create schemas implicitly.
    """
    from sqlalchemy import text

    from app.core.config import settings
    from app.core.database import async_session

    expected_head = settings.ALEMBIC_EXPECTED_HEAD  # set in env (default: head)

    async with async_session() as session:
        try:
            await session.execute(text("SELECT 1 FROM alembic_version LIMIT 1"))
            row = (await session.execute(text("SELECT version_num FROM alembic_version"))).first()
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                "alembic_version table not found — run `alembic upgrade head` "
                "before starting the API. Underlying error: %s" % exc
            ) from exc

    if row is None:
        raise RuntimeError(
            "alembic_version is empty — Alembic has not stamped this database. "
            "Run `alembic upgrade head` from the deployment script."
        )

    current_revisions = {r[0] for r in [row]}
    if expected_head and current_revisions != {expected_head}:
        raise RuntimeError(
            "Database is at Alembic revision %r but the deployment expects %r. "
            "Run `alembic upgrade head` (or `alembic stamp %s` for the "
            "documented baseline) before serving traffic."
            % (current_revisions, expected_head, expected_head)
        )
    logger.info("Schema verified at Alembic revision: %s", current_revisions)


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
        logger.error(
            "Unhandled exception on %s %s: %s\n%s",
            request.method, request.url.path, exc, traceback.format_exc(),
        )
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
    app.include_router(public_semantic_router)

    @app.on_event("startup")
    async def startup():
        await _verify_schema()

    @app.on_event("shutdown")
    async def shutdown():
        dispose_sync_engine()

    return app


app = create_app()
