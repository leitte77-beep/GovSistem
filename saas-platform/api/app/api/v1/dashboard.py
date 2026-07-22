from datetime import datetime, timezone
import shutil

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.audit_event import AuditEvent
from app.models.invoice import Invoice
from app.models.module import Module
from app.models.organization import Organization
from app.models.sso_session import SsoSession
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.schemas import DashboardStats, DiskInfo, ModuleInfo

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _time_ago(dt: datetime) -> str:
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    diff = now - dt
    seconds = int(diff.total_seconds())
    if seconds < 0:
        return "Agora mesmo"
    if seconds < 60:
        return f"Há {seconds} segundos"
    minutes = seconds // 60
    if minutes < 60:
        return f"Há {minutes} minuto{'s' if minutes > 1 else ''}"
    hours = minutes // 60
    if hours < 24:
        return f"Há {hours} hora{'s' if hours > 1 else ''}"
    days = hours // 24
    return f"Há {days} dia{'s' if days > 1 else ''}"


async def _get_last_publication() -> str:
    diario_url = settings.DIARIO_MODULE_INTERNAL_API_URL
    if not diario_url:
        return "—"
    try:
        internal_key = settings.INTERNAL_API_KEY.get_secret_value()
        headers = {"X-Internal-Key": internal_key}
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{diario_url}/api/v1/editions",
                params={"per_page": 1, "sort": "created_at", "order": "desc"},
                headers=headers,
            )
            if resp.status_code == 200:
                data = resp.json()
                editions = data if isinstance(data, list) else data.get("data", [])
                if editions:
                    pub_at = editions[0].get("published_at") or editions[0].get(
                        "created_at"
                    )
                    if pub_at:
                        dt = datetime.fromisoformat(
                            pub_at.replace("Z", "+00:00")
                        )
                        return _time_ago(dt)
    except Exception:
        pass
    return "—"


@router.get("", response_model=DashboardStats)
async def get_dashboard_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    is_platform_admin = user.is_platform_admin or user.platform_role == "SUPER_ADMIN"

    modules_result = await db.execute(
        select(Module).where(Module.is_active.is_(True)).order_by(Module.name)
    )
    all_modules = modules_result.scalars().all()

    if is_platform_admin:
        modules = all_modules
        total_orgs = await db.scalar(
            select(func.count(Organization.id)).where(Organization.deleted_at.is_(None))
        )
        active_orgs = await db.scalar(
            select(func.count(Organization.id)).where(
                Organization.deleted_at.is_(None), Organization.is_active.is_(True)
            )
        )
        total_users = await db.scalar(
            select(func.count(User.id)).where(User.deleted_at.is_(None))
        )
        total_subs = await db.scalar(select(func.count(Subscription.id)))
        active_subs = await db.scalar(
            select(func.count(Subscription.id)).where(Subscription.status == "active")
        )
        mrr = await db.scalar(
            select(func.coalesce(func.sum(Invoice.amount_cents), 0)).where(
                Invoice.status == "paid"
            )
        )
        recent_invoices = await db.scalar(
            select(func.count(Invoice.id)).where(Invoice.status == "pending")
        )
    else:
        user_perms = user.module_permissions or {}
        allowed_slugs = set(user_perms.get("modules", []) if isinstance(user_perms, dict) else user_perms)
        modules = [m for m in all_modules if m.slug in allowed_slugs]
        total_orgs = None
        active_orgs = None
        total_users = None
        total_subs = None
        active_subs = None
        mrr = None
        recent_invoices = None

    last_publication_ago = await _get_last_publication()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    online_count = await db.scalar(
        select(func.count(SsoSession.id)).where(
            SsoSession.is_active.is_(True),
            SsoSession.expires_at > now,
        )
    )

    system_status = "100% Operacional"
    try:
        diario_url = settings.DIARIO_MODULE_INTERNAL_API_URL
        if diario_url:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{diario_url}/api/v1/health")
            if resp.status_code != 200 or resp.json().get("status") != "ok":
                system_status = "Falha no módulo Diário"
    except Exception:
        pass

    # Disk usage
    try:
        disk_usage = shutil.disk_usage("/")
        disk_info = DiskInfo(
            total_gb=round(disk_usage.total / (1024 ** 3), 2),
            used_gb=round(disk_usage.used / (1024 ** 3), 2),
            free_gb=round(disk_usage.free / (1024 ** 3), 2),
            percent_used=round((disk_usage.used / disk_usage.total) * 100, 1),
        )
    except Exception:
        disk_info = None

    return DashboardStats(
        total_organizations=total_orgs or 0,
        active_organizations=active_orgs or 0,
        total_users=total_users or 0,
        total_subscriptions=total_subs or 0,
        active_subscriptions=active_subs or 0,
        monthly_recurring_revenue_cents=mrr or 0,
        total_modules=len(modules),
        recent_invoices_count=recent_invoices or 0,
        modules=[ModuleInfo.model_validate(m) for m in modules],
        last_publication_ago=last_publication_ago,
        online_users_count=online_count or 0,
        system_status=system_status,
        disk=disk_info,
    )
