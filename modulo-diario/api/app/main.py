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


async def _ensure_schema() -> None:
    """Idempotent runtime schema bootstrap.

    Adds columns introduced after the original deployment without relying on
    a single alembic head (this deployment does not use alembic_version).
    Each statement is guarded so it is safe to run on every startup.
    """
    from sqlalchemy import text
    from app.core.database import async_session

    statements = [
        (
            "ALTER TABLE matters ADD COLUMN IF NOT EXISTS "
            "content_mode VARCHAR(20) DEFAULT 'rich_text' NOT NULL"
        ),
        # ── Semantic document engine (additive, feature-flagged) ─────────────
        "ALTER TABLE matters ADD COLUMN IF NOT EXISTS semantic_content JSONB",
        "ALTER TABLE matters ADD COLUMN IF NOT EXISTS semantic_schema_version INTEGER",
        "ALTER TABLE matters ADD COLUMN IF NOT EXISTS source_hash VARCHAR(64)",
        "ALTER TABLE matters ADD COLUMN IF NOT EXISTS text_integrity_hash VARCHAR(64)",
        "ALTER TABLE matters ADD COLUMN IF NOT EXISTS classification_status VARCHAR(20)",
        "ALTER TABLE matters ADD COLUMN IF NOT EXISTS template_id UUID",
        "ALTER TABLE matters ADD COLUMN IF NOT EXISTS template_version INTEGER",
        (
            "CREATE TABLE IF NOT EXISTS publication_templates ("
            "id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES "
            "organizations(id) ON DELETE CASCADE, name VARCHAR(200) NOT NULL, "
            "slug VARCHAR(100) NOT NULL, document_type VARCHAR(50) NOT NULL, "
            "is_default BOOLEAN NOT NULL DEFAULT FALSE, "
            "status VARCHAR(20) NOT NULL, active_version INTEGER, "
            "created_by UUID REFERENCES users(id) ON DELETE SET NULL, "
            "created_at TIMESTAMPTZ NOT NULL DEFAULT now(), "
            "updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"
        ),
        (
            "CREATE TABLE IF NOT EXISTS publication_template_versions ("
            "id UUID PRIMARY KEY, template_id UUID NOT NULL REFERENCES "
            "publication_templates(id) ON DELETE CASCADE, "
            "version_number INTEGER NOT NULL, status VARCHAR(20) NOT NULL, "
            "config_json JSONB NOT NULL, config_hash VARCHAR(64) NOT NULL, "
            "asset_snapshot JSONB, change_reason TEXT, "
            "created_by UUID REFERENCES users(id) ON DELETE SET NULL, "
            "created_at TIMESTAMPTZ NOT NULL DEFAULT now(), "
            "updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), "
            "UNIQUE (template_id, version_number))"
        ),
        (
            "CREATE TABLE IF NOT EXISTS edition_publication_snapshots ("
            "id UUID PRIMARY KEY, edition_id UUID NOT NULL REFERENCES "
            "editions(id) ON DELETE CASCADE, organization_id UUID NOT NULL "
            "REFERENCES organizations(id) ON DELETE CASCADE, "
            "content JSONB NOT NULL, content_manifest_hash VARCHAR(64) NOT NULL, "
            "frozen_at TIMESTAMPTZ NOT NULL, "
            "frozen_by UUID REFERENCES users(id) ON DELETE SET NULL, "
            "is_valid BOOLEAN NOT NULL DEFAULT TRUE, "
            "created_at TIMESTAMPTZ NOT NULL DEFAULT now(), "
            "updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"
        ),
        (
            "CREATE TABLE IF NOT EXISTS publication_artifacts ("
            "id UUID PRIMARY KEY, snapshot_id UUID NOT NULL REFERENCES "
            "edition_publication_snapshots(id) ON DELETE CASCADE, "
            "artifact_type VARCHAR(30) NOT NULL, "
            "storage_path VARCHAR(1000) NOT NULL, "
            "sha256 VARCHAR(64) NOT NULL, size_bytes INTEGER NOT NULL, "
            "mime_type VARCHAR(200) NOT NULL, "
            "generated_at TIMESTAMPTZ NOT NULL, "
            "renderer VARCHAR(100), renderer_version VARCHAR(50), "
            "validation_status VARCHAR(50), is_preview BOOLEAN NOT NULL DEFAULT FALSE, "
            "created_at TIMESTAMPTZ NOT NULL DEFAULT now(), "
            "updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"
        ),
        (
            "CREATE INDEX IF NOT EXISTS ix_publication_templates_organization_id "
            "ON publication_templates(organization_id)"
        ),
        (
            "CREATE INDEX IF NOT EXISTS ix_publication_templates_status "
            "ON publication_templates(status)"
        ),
        (
            "CREATE INDEX IF NOT EXISTS ix_publication_template_versions_template_id "
            "ON publication_template_versions(template_id)"
        ),
        (
            "CREATE INDEX IF NOT EXISTS ix_edition_publication_snapshots_edition_id "
            "ON edition_publication_snapshots(edition_id)"
        ),
        (
            "CREATE INDEX IF NOT EXISTS ix_publication_artifacts_snapshot_id "
            "ON publication_artifacts(snapshot_id)"
        ),
        (
            # FK for matters.template_id (PostgreSQL lacks ADD CONSTRAINT IF NOT EXISTS)
            "DO $$ BEGIN "
            "IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname="
            "'fk_matters_template_id_publication_templates') THEN "
            "ALTER TABLE matters ADD CONSTRAINT fk_matters_template_id_publication_templates "
            "FOREIGN KEY (template_id) REFERENCES publication_templates(id) "
            "ON DELETE SET NULL; END IF; END $$"
        ),
    ]
    try:
        async with async_session() as session:
            for stmt in statements:
                try:
                    await session.execute(text(stmt))
                    await session.commit()
                except Exception:  # noqa: BLE001 - one failed stmt must not abort the rest
                    await session.rollback()
                    logger.warning(
                        "Schema bootstrap statement skipped: %s", stmt[:120], exc_info=True
                    )
    except Exception:  # noqa: BLE001 - schema bootstrap must never crash startup
        logger.warning("Schema bootstrap skipped (DB may not be ready)", exc_info=True)


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
        await _ensure_schema()

    @app.on_event("shutdown")
    async def shutdown():
        dispose_sync_engine()

    return app


app = create_app()
