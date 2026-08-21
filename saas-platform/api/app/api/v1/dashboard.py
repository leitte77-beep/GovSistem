import asyncio
import shutil
import time
from datetime import datetime, timezone

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
from app.schemas.schemas import DashboardStats, DiskInfo, ModuleHealth, ModuleInfo

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
    """Ultima edicao publicada no Diario.

    Usa a rota publica /public/editions: a rota autenticada /editions exige JWT de
    usuario (a chave interna nao serve) e sempre devolvia 401, por isso o card
    mostrava "—".
    """
    diario_url = settings.DIARIO_MODULE_INTERNAL_API_URL
    if not diario_url:
        return "—"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{diario_url.rstrip('/')}/public/editions",
                params={"limit": 1},
            )
        if resp.status_code != 200:
            return "—"
        editions = resp.json()
        if not isinstance(editions, list) or not editions:
            return "—"
        pub_at = editions[0].get("publication_date") or editions[0].get("created_at")
        if not pub_at:
            return "—"
        dt = datetime.fromisoformat(str(pub_at).replace("Z", "+00:00"))
        return _time_ago(dt)
    except Exception:
        return "—"


MODULE_HEALTH_URLS = {
    "diario": ("DIARIO_MODULE_INTERNAL_API_URL", "/health"),
    "chatgov": ("CHATGOV_MODULE_INTERNAL_API_URL", "/health"),
    "govtask": ("GOVTASK_MODULE_INTERNAL_API_URL", "/health"),
    "govavalia": ("GOVAVALIA_MODULE_INTERNAL_API_URL", "/health"),
    "govsocial": ("GOVSOCIAL_MODULE_INTERNAL_API_URL", "/health"),
    "govdoc": ("GOVDOC_MODULE_INTERNAL_API_URL", "/health"),
    "govpro": ("GOVPRO_MODULE_INTERNAL_API_URL", "/health"),
}


async def _check_module_health(slug: str, name: str) -> ModuleHealth:
    """Sonda o /health do modulo.

    Nem todo modulo expoe /health sem autenticacao: 401/403/404/405 significam que o
    servico respondeu (esta de pe), so nao tem a rota liberada. Erro de conexao ou
    5xx e que indicam problema de verdade.
    """
    if slug == "financeiro":
        # Roda dentro da propria API da plataforma
        return ModuleHealth(slug=slug, name=name, status="online", detail="Interno da plataforma")

    config = MODULE_HEALTH_URLS.get(slug)
    if not config:
        return ModuleHealth(slug=slug, name=name, status="unknown", detail="Sem URL configurada")

    setting_name, path = config
    base_url = getattr(settings, setting_name, None)
    if not base_url:
        return ModuleHealth(slug=slug, name=name, status="unknown", detail="Sem URL configurada")

    url = f"{base_url.rstrip('/')}{path}"
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=4) as client:
            resp = await client.get(url)
        latency = int((time.monotonic() - started) * 1000)
        if resp.status_code >= 500:
            return ModuleHealth(
                slug=slug, name=name, status="degraded",
                detail=f"HTTP {resp.status_code}", latency_ms=latency,
            )
        if resp.status_code == 200:
            try:
                payload = resp.json()
            except Exception:
                payload = {}
            if isinstance(payload, dict) and payload.get("status") not in (None, "ok", "healthy", "up"):
                return ModuleHealth(
                    slug=slug, name=name, status="degraded",
                    detail=str(payload.get("status")), latency_ms=latency,
                )
            return ModuleHealth(slug=slug, name=name, status="online", detail="Operacional", latency_ms=latency)
        return ModuleHealth(
            slug=slug, name=name, status="online",
            detail=f"Respondendo (HTTP {resp.status_code})", latency_ms=latency,
        )
    except Exception as e:
        return ModuleHealth(slug=slug, name=name, status="offline", detail=type(e).__name__)


async def _check_modules_health(modules) -> list[ModuleHealth]:
    results = await asyncio.gather(
        *[_check_module_health(m.slug, m.name) for m in modules],
        return_exceptions=True,
    )
    out: list[ModuleHealth] = []
    for module, result in zip(modules, results):
        if isinstance(result, ModuleHealth):
            out.append(result)
        else:
            out.append(ModuleHealth(slug=module.slug, name=module.name, status="unknown"))
    return out


@router.get("", response_model=DashboardStats)
async def get_dashboard_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    is_platform_admin = user.is_platform_admin or user.platform_role == "SUPER_ADMIN"

    organization_name = None
    if user.organization_id:
        organization_name = await db.scalar(
            select(Organization.name).where(Organization.id == user.organization_id)
        )

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

    module_health: list[ModuleHealth] = []
    if is_platform_admin:
        module_health = await _check_modules_health(all_modules)
        offline = [m for m in module_health if m.status == "offline"]
        degraded = [m for m in module_health if m.status == "degraded"]
        if offline:
            names = ", ".join(m.name for m in offline[:2])
            extra = f" +{len(offline) - 2}" if len(offline) > 2 else ""
            system_status = f"Fora do ar: {names}{extra}"
        elif degraded:
            system_status = f"Instável: {', '.join(m.name for m in degraded[:2])}"
        else:
            system_status = "100% Operacional"
    else:
        system_status = "100% Operacional"

    # Uso de disco e sessoes ativas sao dados de infraestrutura: so para admin da plataforma
    if not is_platform_admin:
        online_count = 0

    disk_info = None
    if is_platform_admin:
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
        module_health=module_health,
        is_platform_admin=is_platform_admin,
        organization_name=organization_name,
        disk=disk_info,
    )
