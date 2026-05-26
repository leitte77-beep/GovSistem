"""Prometheus metrics and operations endpoints."""

import logging
import platform
import time
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func as sa_func
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models.audit_event import AuditEvent
from app.models.edition import Edition
from app.models.enums import EditionStatus, MatterStatus
from app.models.matter import Matter
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(tags=["operations"])

START_TIME = time.time()

METRICS_TEXT = """# HELP doe_info System info
# TYPE doe_info gauge
doe_info{version="0.1.0",python="{python}"} 1
# HELP doe_up Service up
# TYPE doe_up gauge
doe_up 1
# HELP doe_uptime_seconds Uptime
# TYPE doe_uptime_seconds counter
doe_uptime_seconds {uptime}
"""

TITLE_MAP = {
    "matter.created": "Matéria — Criada",
    "matter.updated": "Matéria — Atualizada",
    "matter.status_changed": "Matéria — Status Alterado",
    "matter.published": "Matéria — Publicada",
    "edition.created": "Edição — Criada",
    "edition.updated": "Edição — Atualizada",
    "edition.status_changed": "Edição — Status Alterado",
    "edition.published": "Edição — Publicada",
    "edition.signed": "Edição — Assinada",
    "edition.cancelled": "Edição — Cancelada",
    "user.created": "Usuário — Criado",
    "user.updated": "Usuário — Atualizado",
    "user.role_changed": "Usuário — Função Alterada",
    "credential.created": "Credencial — Criada",
    "credential.updated": "Credencial — Atualizada",
    "file.uploaded": "Arquivo — Enviado",
    "file.deleted": "Arquivo — Excluído",
    "login": "Login",
    "login.failed": "Login — Falha",
    "logout": "Logout",
}

ICON_MAP = {
    "matter.created": {"icon": "description", "color": "text-primary"},
    "matter.updated": {"icon": "description", "color": "text-primary"},
    "matter.status_changed": {"icon": "swap_horiz", "color": "text-primary"},
    "matter.published": {"icon": "description", "color": "text-tertiary"},
    "edition.created": {"icon": "auto_stories", "color": "text-primary"},
    "edition.updated": {"icon": "notifications", "color": "text-primary"},
    "edition.status_changed": {"icon": "check_circle", "color": "text-secondary"},
    "edition.published": {"icon": "notifications", "color": "text-tertiary"},
    "edition.signed": {"icon": "notifications", "color": "text-tertiary"},
    "edition.cancelled": {"icon": "check_circle", "color": "text-error"},
    "user.created": {"icon": "group_add", "color": "text-secondary"},
    "user.updated": {"icon": "group_add", "color": "text-secondary"},
    "user.role_changed": {"icon": "group_add", "color": "text-secondary"},
    "credential.created": {"icon": "verified_user", "color": "text-tertiary"},
    "credential.updated": {"icon": "verified_user", "color": "text-tertiary"},
    "file.uploaded": {"icon": "upload_file", "color": "text-secondary"},
    "file.deleted": {"icon": "delete", "color": "text-error"},
    "login": {"icon": "login", "color": "text-secondary"},
    "login.failed": {"icon": "login", "color": "text-error"},
    "logout": {"icon": "logout", "color": "text-secondary"},
}


@router.get("/metrics")
async def prometheus_metrics():
    """Prometheus metrics endpoint (text format)."""
    python_ver = platform.python_version()
    uptime = int(time.time() - START_TIME)
    text = METRICS_TEXT.format(python=python_ver, uptime=uptime)
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(content=text, media_type="text/plain")


@router.get("/operations/health")
async def operations_health(
    db: AsyncSession = Depends(get_db),
):
    """Detailed health check for operations monitoring."""
    checks = {}

    # Database check
    try:
        result = await db.execute(select(sa_func.now()))
        db_time = result.scalar()
        checks["database"] = {"status": "ok", "server_time": str(db_time)}
    except Exception as e:
        checks["database"] = {"status": "error", "detail": str(e)}

    # Published editions count
    try:
        pub_result = await db.execute(
            select(sa_func.count(Edition.id)).where(
                Edition.status == EditionStatus.PUBLISHED
            )
        )
        checks["editions_published"] = pub_result.scalar() or 0
    except Exception:
        checks["editions_published"] = -1

    return {
        "service": "doe-api",
        "version": "0.1.0",
        "uptime_seconds": int(time.time() - START_TIME),
        "checks": checks,
    }


@router.get("/operations/dashboard")
async def operations_dashboard(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Admin dashboard with system status."""
    total_editions = await db.execute(select(sa_func.count(Edition.id)))
    published = await db.execute(
        select(sa_func.count(Edition.id)).where(Edition.status == EditionStatus.PUBLISHED)
    )
    draft_editions = await db.execute(
        select(sa_func.count(Edition.id)).where(Edition.status == EditionStatus.DRAFT)
    )
    signed = await db.execute(
        select(sa_func.count(Edition.id)).where(Edition.status == EditionStatus.SIGNED)
    )
    pdf_gen = await db.execute(
        select(sa_func.count(Edition.id)).where(Edition.status == EditionStatus.PDF_GENERATED)
    )

    total_matters = await db.execute(select(sa_func.count(Matter.id)))
    draft_matters = await db.execute(
        select(sa_func.count(Matter.id)).where(Matter.status == MatterStatus.DRAFT)
    )
    review_matters = await db.execute(
        select(sa_func.count(Matter.id)).where(Matter.status == MatterStatus.REVIEW)
    )
    approved_matters = await db.execute(
        select(sa_func.count(Matter.id)).where(Matter.status == MatterStatus.APPROVED)
    )
    published_matters = await db.execute(
        select(sa_func.count(Matter.id)).where(Matter.status == MatterStatus.PUBLISHED)
    )

    return {
        "uptime_seconds": int(time.time() - START_TIME),
        "editions": {
            "total": total_editions.scalar() or 0,
            "draft": draft_editions.scalar() or 0,
            "published": published.scalar() or 0,
            "signed": signed.scalar() or 0,
            "pdf_generated": pdf_gen.scalar() or 0,
        },
        "matters": {
            "total": total_matters.scalar() or 0,
            "draft": draft_matters.scalar() or 0,
            "review": review_matters.scalar() or 0,
            "approved": approved_matters.scalar() or 0,
            "published": published_matters.scalar() or 0,
        },
        "alerts": {
            "certificates_expiring_soon": [],
        },
    }


@router.get("/operations/queue-status")
async def queue_status(
    user: User = Depends(require_roles("ADMIN", "AUDITOR")),
):
    """Check Celery/Redis queue status."""
    try:
        import redis as redis_mod

        from app.core.config import settings as s
        r = redis_mod.Redis(host=s.REDIS_HOST, port=s.REDIS_PORT, db=s.REDIS_DB)

        # Celery uses Redis keys for queue stats
        queue_length = r.llen("celery") if r.exists("celery") else 0
        active = len(r.keys("celery-active*") or [])
        reserved = len(r.keys("celery-reserved*") or [])

        return {
            "queue_length": queue_length,
            "active_tasks": active,
            "reserved_tasks": reserved,
            "celery_workers": "unknown",
            "status": "ok" if queue_length < 100 else "warning",
        }
    except Exception as e:
        return {
            "queue_length": -1,
            "active_tasks": 0,
            "reserved_tasks": 0,
            "celery_workers": "unknown",
            "status": "error",
            "detail": str(e),
        }


def _format_time(evt: AuditEvent) -> str:
    now = datetime.utcnow()
    created = evt.created_at.replace(tzinfo=None) if evt.created_at else now
    time_diff = int((now - created).total_seconds())
    if time_diff < 60:
        return "agora"
    elif time_diff < 3600:
        return f"{time_diff // 60} min atrás"
    elif time_diff < 86400:
        return f"{time_diff // 3600} h atrás"
    else:
        return f"{time_diff // 86400} dia(s) atrás"


@router.get("/operations/notifications")
async def operations_notifications(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "AUDITOR")),
):
    """Recent system notifications from audit events."""
    result = await db.execute(
        select(AuditEvent)
        .order_by(AuditEvent.created_at.desc())
        .limit(20)
    )
    events = result.scalars().all()

    notifications = []
    for evt in events:
        defaults = {"icon": "notifications", "color": "text-on-surface-variant"}
        meta = ICON_MAP.get(evt.action, defaults)
        title = TITLE_MAP.get(evt.action, evt.action.replace("_", " ").replace(".", " — ").title())

        notifications.append({
            "id": str(evt.id),
            "icon": meta["icon"],
            "color": meta["color"],
            "title": title,
            "desc": evt.description or "",
            "time": _format_time(evt),
            "read": evt.read,
        })

    return notifications


@router.patch("/operations/notifications/read-all")
async def notifications_read_all(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "AUDITOR")),
):
    """Mark all unread notifications as read."""
    await db.execute(
        update(AuditEvent)
        .where(AuditEvent.read == False)  # noqa: E712
        .values(read=True)
    )
    await db.commit()
    return {"status": "ok"}
