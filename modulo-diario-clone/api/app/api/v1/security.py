"""Security-related endpoints: backup, audit export, privacy."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_roles
from app.core.database import get_db
from app.models.user import User
from app.services.audit_export import export_audit_csv, get_log_retention_days

router = APIRouter(tags=["security"])


@router.get("/security/audit/export")
async def export_audit(
    days: int = 90,
    action: str | None = None,
    user_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("AUDITOR", "ADMIN")),
):
    if days > get_log_retention_days():
        raise HTTPException(
            status_code=400,
            detail=f"Cannot export more than {get_log_retention_days()} days of logs",
        )

    csv_data = await export_audit_csv(db, days=days, action=action, user_id=user_id)
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=audit_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv",
        },
    )


@router.get("/security/audit/retention")
async def audit_retention_policy(
    _: User = Depends(require_roles("AUDITOR", "ADMIN")),
):
    return {
        "retention_days": get_log_retention_days(),
        "policy": f"Audit logs are retained for {get_log_retention_days()} days",
    }


@router.get("/security/backup/guide")
async def backup_guide(
    _: User = Depends(require_roles("ADMIN")),
):
    return {
        "strategy": "encrypted",
        "frequency": "daily",
        "encryption": "AES-256-GCM via Fernet (derived from SECRET_KEY)",
        "storage": "Encrypted backups stored in backups/encrypted/",
        "procedure": (
            "1. Run: pg_dump ... | gzip | openssl enc -aes-256-cbc -salt > backup.sql.gz.enc\n"
            "2. Copy to offsite storage\n"
            "3. Test restoration quarterly\n"
            "4. Store encryption key separately from backups"
        ),
    }
