from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.health import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db)):
    db_ok = False
    try:
        result = await db.execute(text("SELECT 1"))
        db_ok = result.scalar() == 1
    except Exception:
        db_ok = False

    if not db_ok:
        return HealthResponse(status="degraded", service="api", version="0.1.0",
                              database="unavailable")

    return HealthResponse(status="ok", service="api", version="0.1.0",
                          database="connected")


@router.get("/health/live")
async def liveness():
    """Process liveness only: never touches DB, TSA, signer or storage.

    A transient external dependency outage must not make Docker/Kubernetes
    restart the API in a loop.
    """
    return {"status": "ok"}


@router.get("/health/ready")
async def readiness(db: AsyncSession = Depends(get_db)):
    """Can this instance serve traffic? Database, migrations and storage only."""
    from app.services.readiness import NOT_READY, ReadinessService, summarize

    checks = await ReadinessService().runtime_checks(db)
    status = summarize(checks)
    body = {
        "status": status,
        "checks": [
            {"code": c.code, "status": c.status, "detail": c.detail}
            for c in checks
        ],
    }
    if status == NOT_READY:
        return JSONResponse(status_code=503, content=body)
    return body
