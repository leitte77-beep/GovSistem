"""Endpoints do portal do tenant (app.govsistem.com.br).

Namespace /tenant: contexto, dashboard, módulos, usuários, grants, auditoria.
Todo acesso é derivado do membership autenticado (get_tenant_context) e filtrado
no backend. Rotas de gestor exigem require_tenant_manager.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import desc, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info
from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_password
from app.core.membership_deps import (
    TenantContext,
    get_tenant_context,
    require_tenant_manager,
)
from app.core.roles import LEGACY_SAFE_ROLE, MODULE_ROLE_CATALOG, is_valid_grant, normalize_grant_role
from app.models.audit_event import AuditEvent
from app.models.membership_module_grant import MembershipModuleGrant
from app.models.module import Module
from app.models.organization_membership import OrganizationMembership
from app.models.organization_module import OrganizationModule
from app.models.sso_session import SsoSession
from app.models.user import User
from app.services.membership import (
    get_active_memberships,
    get_membership,
    get_membership_grants,
    is_flag,
    org_has_module,
    resolve_module_roles,
    would_remove_last_active_manager,
)

router = APIRouter(prefix="/tenant", tags=["tenant"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class TenantInfo(BaseModel):
    organization_id: uuid.UUID
    slug: str
    name: str
    membership_role: str
    is_manager: bool


class ModuleCard(BaseModel):
    slug: str
    name: str
    description: Optional[str]
    icon: Optional[str]
    version: str
    is_active: bool
    available: bool  # tenant contratou e módulo ativo
    authorized: bool  # usuário tem grant/fallback
    requires_review: bool = False
    module_url: Optional[str] = None
    unavailable_reason: Optional[str] = None


class MemberCreate(BaseModel):
    name: str
    email: EmailStr
    membership_role: str = "ORG_MEMBER"
    is_active: bool = True
    force_password_reset: bool = True
    phone: Optional[str] = None
    cpf: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    grants: Optional[dict[str, list[str]]] = None  # {module_slug: [roles]} opcional


class MemberUpdate(BaseModel):
    membership_role: Optional[str] = None
    is_active: Optional[bool] = None


class MemberProfileUpdate(BaseModel):
    """Edição completa do cadastro do usuário do tenant (gestor).

    Nome, e-mail, telefone e CPF são dados globais da identidade. Cargo,
    departamento, perfil (membership_role) e status do vínculo são
    específicos do membership e não afetam outros tenants."""
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    cpf: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    membership_role: Optional[str] = None
    is_active: Optional[bool] = None


class GrantsBody(BaseModel):
    # { "diario": ["AUTOR"], "govtask": ["ASSESSOR"] } — roles do catálogo
    grants: dict[str, list[str]]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _resolve_module_url(module: Module) -> str:
    # Precedência: .env *_MODULE_ADMIN_URL > modules.admin_url > modules.base_url
    env_key = f"{module.slug.upper()}_MODULE_ADMIN_URL"
    env_url = getattr(settings, env_key, None)
    if env_url:
        return env_url
    return module.admin_url or module.base_url


async def _log(
    db: AsyncSession,
    request: Request,
    ctx: TenantContext,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    details: dict | None = None,
) -> None:
    ci = get_client_info(request)
    db.add(
        AuditEvent(
            actor_id=ctx.user.id,
            actor_email=ctx.user.email,
            organization_id=ctx.organization_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            ip_address=ci["ip_address"],
            user_agent=ci["user_agent"],
        )
    )


# ---------------------------------------------------------------------------
# GET /tenant/organizations — tenants disponíveis (troca de tenant)
# ---------------------------------------------------------------------------
@router.get("/organizations", response_model=list[TenantInfo])
async def my_organizations(
    request: Request,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    mems = await get_active_memberships(db, ctx.user.id)
    return [
        TenantInfo(
            organization_id=m.organization_id,
            slug=m.organization.slug,
            name=m.organization.name,
            membership_role=m.membership_role,
            is_manager=m.membership_role == "ORG_ADMIN",
        )
        for m in mems
    ]


# ---------------------------------------------------------------------------
# GET /tenant/context — contexto + módulos do usuário
# ---------------------------------------------------------------------------
@router.get("/context")
async def tenant_context(
    request: Request,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    my_modules = await _my_modules(db, ctx)
    return {
        "organization": {
            "id": str(ctx.organization_id),
            "slug": ctx.organization.slug,
            "name": ctx.organization.name,
            "logo_url": ctx.organization.logo_url,
            "is_active": ctx.organization.is_active,
        },
        "user": {
            "id": str(ctx.user.id),
            "name": ctx.user.name,
            "email": ctx.user.email,
            "profile": ctx.membership.membership_role,
            "is_manager": ctx.is_manager,
        },
        "modules": [m.model_dump() for m in my_modules],
        "feature_flags": {
            "tenant_portal": await is_flag(db, "TENANT_PORTAL_ENABLED"),
            "sso_code_launch": await is_flag(db, "SSO_CODE_LAUNCH_ENABLED"),
        },
    }


async def _my_modules(db: AsyncSession, ctx: TenantContext) -> list[ModuleCard]:
    # módulos contratados pelo tenant (organization_modules ativo) e ativos
    rows = (
        await db.execute(
            select(Module)
            .join(OrganizationModule, OrganizationModule.module_id == Module.id)
            .where(
                OrganizationModule.organization_id == ctx.organization_id,
                OrganizationModule.is_active.is_(True),
                Module.is_active.is_(True),
            )
            .order_by(Module.name)
        )
    ).scalars().all()

    cards: list[ModuleCard] = []
    for mod in rows:
        roles, used_legacy = await resolve_module_roles(
            db, ctx.user, ctx.organization_id, mod.slug
        )
        pending_review = False
        if await is_flag(db, "MEMBERSHIP_GRANTS_V2_ENABLED"):
            for g in await get_membership_grants(db, ctx.membership_id, mod.slug):
                if g.requires_review:
                    pending_review = True
        authorized = bool(roles)
        card = ModuleCard(
            slug=mod.slug,
            name=mod.name,
            description=mod.description,
            icon=mod.icon,
            version=mod.version,
            is_active=mod.is_active,
            available=True,
            authorized=authorized,
            requires_review=pending_review,
            module_url=_resolve_module_url(mod),
            unavailable_reason=None,
        )
        cards.append(card)
    return cards


@router.get("/modules", response_model=list[ModuleCard])
async def tenant_modules(
    request: Request,
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    return await _my_modules(db, ctx)


# ---------------------------------------------------------------------------
# GET /tenant/dashboard — indicadores do gestor
# ---------------------------------------------------------------------------
# Ruído técnico que não entra nos feeds (continua na auditoria completa).
_FEED_NOISE = ["sso_code_issued", "sso_code_exchanged", "tenant_switch"]


def _event_target_user_id(e: AuditEvent) -> Optional[str]:
    if isinstance(e.details, dict) and e.details.get("user_id"):
        return str(e.details["user_id"])
    if e.resource_type in ("user", "user_grants") and e.resource_id:
        return e.resource_id
    return None


async def _enrich_activity(db: AsyncSession, events) -> list[dict]:
    """Eventos de auditoria com nomes legíveis: quem fez, sobre quem e qual módulo."""
    user_ids: set[uuid.UUID] = set()
    for e in events:
        for raw in (e.actor_id, _event_target_user_id(e)):
            try:
                if raw:
                    user_ids.add(raw if isinstance(raw, uuid.UUID) else uuid.UUID(str(raw)))
            except ValueError:
                pass
    user_names: dict[str, str] = {}
    if user_ids:
        rows = (await db.execute(select(User.id, User.name).where(User.id.in_(user_ids)))).all()
        user_names = {str(uid): name for uid, name in rows if name}
    module_names = {
        slug: name for slug, name in (await db.execute(select(Module.slug, Module.name))).all()
    }

    def module_name(e: AuditEvent) -> Optional[str]:
        if not isinstance(e.details, dict):
            return None
        slug = e.details.get("module_slug") or e.details.get("module")
        return module_names.get(slug, slug) if isinstance(slug, str) else None

    def grant_summary(e: AuditEvent) -> list[str]:
        d = e.details if isinstance(e.details, dict) else {}
        if isinstance(d.get("grants"), dict):
            return [
                f"{module_names.get(slug, slug)} · {', '.join(map(str, roles)) or 'sem perfil'}"
                for slug, roles in d["grants"].items()
                if isinstance(roles, list)
            ]
        if d.get("role") and module_name(e):
            return [f"{module_name(e)} · {d['role']}"]
        return []

    return [
        {
            "id": str(e.id),
            "action": e.action,
            "resource_type": e.resource_type,
            "resource_id": e.resource_id,
            "actor_email": e.actor_email,
            "actor_name": user_names.get(str(e.actor_id)) if e.actor_id else None,
            "target_name": user_names.get(_event_target_user_id(e) or ""),
            "module_name": module_name(e),
            "grant_summary": grant_summary(e),
            "ip_address": e.ip_address,
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "details": e.details,
        }
        for e in events
    ]


@router.get("/dashboard")
async def tenant_dashboard(
    request: Request,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    mems = (
        await db.execute(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == ctx.organization_id,
                OrganizationMembership.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    total = len(mems)
    active = sum(1 for m in mems if m.is_active)
    suspended = sum(1 for m in mems if not m.is_active)
    managers = sum(1 for m in mems if m.membership_role == "ORG_ADMIN" and m.is_active)

    modules = (
        await db.execute(
            select(func.count(OrganizationModule.id)).where(
                OrganizationModule.organization_id == ctx.organization_id,
                OrganizationModule.is_active.is_(True),
            )
        )
    ).scalar() or 0

    grants_total = (
        await db.execute(
            select(func.count(MembershipModuleGrant.id)).where(
                MembershipModuleGrant.membership_id.in_([m.id for m in mems]),
                MembershipModuleGrant.deleted_at.is_(None),
            )
        )
    ).scalar() or 0
    grants_pending = (
        await db.execute(
            select(func.count(MembershipModuleGrant.id)).where(
                MembershipModuleGrant.membership_id.in_([m.id for m in mems]),
                MembershipModuleGrant.requires_review.is_(True),
                MembershipModuleGrant.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    # Troca de código SSO e troca de órgão são ruído técnico (já existe o
    # module_access / login correspondente); ficam só na auditoria completa.
    recent = (
        await db.execute(
            select(AuditEvent)
            .where(
                AuditEvent.organization_id == ctx.organization_id,
                AuditEvent.action.notin_(_FEED_NOISE),
            )
            .order_by(desc(AuditEvent.created_at))
            .limit(60)
        )
    ).scalars().all()

    activity = await _enrich_activity(db, recent)

    # Novidades: módulos contratados nos últimos 30 dias.
    news_since = datetime.now(timezone.utc) - timedelta(days=30)
    news_rows = (
        await db.execute(
            select(OrganizationModule, Module)
            .join(Module, Module.id == OrganizationModule.module_id)
            .where(
                OrganizationModule.organization_id == ctx.organization_id,
                OrganizationModule.is_active.is_(True),
                Module.is_active.is_(True),
                OrganizationModule.created_at >= news_since,
            )
            .order_by(desc(OrganizationModule.created_at))
            .limit(6)
        )
    ).all()

    return {
        "organization": {"name": ctx.organization.name, "slug": ctx.organization.slug},
        "counts": {
            "users_total": total,
            "users_active": active,
            "users_suspended": suspended,
            "managers_active": managers,
            "modules_contracted": modules,
            "grants_total": grants_total,
            "grants_pending_review": grants_pending,
        },
        "recent_activity": activity,
        "news": [
            {
                "slug": mod.slug,
                "name": mod.name,
                "description": mod.description,
                "version": mod.version,
                "created_at": om.created_at.isoformat() if om.created_at else None,
            }
            for om, mod in news_rows
        ],
    }


# ---------------------------------------------------------------------------
# Gestão de usuários do tenant (gestor)
# ---------------------------------------------------------------------------
@router.get("/roles")
async def tenant_role_catalog(
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Catálogo de roles por módulo contratado (para a UI de grants do gestor)."""
    rows = (
        await db.execute(
            select(Module)
            .join(OrganizationModule, OrganizationModule.module_id == Module.id)
            .where(
                OrganizationModule.organization_id == ctx.organization_id,
                OrganizationModule.is_active.is_(True),
                Module.is_active.is_(True),
            )
            .order_by(Module.name)
        )
    ).scalars().all()
    result = []
    for mod in rows:
        roles = [
            {"name": r["name"], "label": r["label"]}
            for r in MODULE_ROLE_CATALOG.get(mod.slug, [])
        ]
        if roles:
            result.append({"slug": mod.slug, "name": mod.name, "roles": roles})
    return result


@router.get("/users")
async def list_tenant_users(
    search: str | None = Query(None),
    is_active: bool | None = Query(None),
    removed: bool = Query(False, description="true lista os vínculos removidos (restauráveis)"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    mems = (
        await db.execute(
            select(OrganizationMembership, User)
            .join(User, User.id == OrganizationMembership.user_id)
            .where(
                OrganizationMembership.organization_id == ctx.organization_id,
                OrganizationMembership.deleted_at.is_not(None)
                if removed
                else OrganizationMembership.deleted_at.is_(None),
                User.deleted_at.is_(None),
            )
            .order_by(User.name)
        )
    ).all()

    # Módulos liberados por vínculo e último login no órgão, em lote (sem N+1).
    mem_ids = [m.id for m, _ in mems]
    grants_by_mem: dict[uuid.UUID, dict[str, dict]] = {}
    if mem_ids and not removed:
        module_names = {
            slug: name for slug, name in (await db.execute(select(Module.slug, Module.name))).all()
        }
        grant_rows = (
            await db.execute(
                select(
                    MembershipModuleGrant.membership_id,
                    MembershipModuleGrant.module_slug,
                    MembershipModuleGrant.requires_review,
                ).where(
                    MembershipModuleGrant.membership_id.in_(mem_ids),
                    MembershipModuleGrant.deleted_at.is_(None),
                    MembershipModuleGrant.is_active.is_(True),
                )
            )
        ).all()
        for mem_id, slug, review in grant_rows:
            entry = grants_by_mem.setdefault(mem_id, {}).setdefault(
                slug, {"slug": slug, "name": module_names.get(slug, slug), "requires_review": False}
            )
            entry["requires_review"] = entry["requires_review"] or bool(review)

    user_ids = [u.id for _, u in mems]
    last_login: dict[uuid.UUID, datetime] = {}
    if user_ids:
        last_login = dict(
            (
                await db.execute(
                    select(AuditEvent.actor_id, func.max(AuditEvent.created_at))
                    .where(
                        AuditEvent.organization_id == ctx.organization_id,
                        # Com a sessão aberta a pessoa abre módulos sem novo login.
                        AuditEvent.action.in_(["login", "module_access"]),
                        AuditEvent.actor_id.in_(user_ids),
                    )
                    .group_by(AuditEvent.actor_id)
                )
            ).all()
        )

    now = datetime.now(timezone.utc)
    rows = []
    for m, u in mems:
        if search and search.lower() not in u.name.lower() and search.lower() not in u.email.lower():
            continue
        if is_active is not None and m.is_active != is_active:
            continue
        locked_until = u.locked_until
        if locked_until is not None and locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        seen = last_login.get(u.id)
        rows.append(
            {
                "user_id": str(m.user_id),
                "membership_id": str(m.id),
                "name": u.name,
                "email": u.email,
                "phone": u.phone,
                "global_active": u.is_active,
                "membership_role": m.membership_role,
                "membership_active": m.is_active,
                "position": m.position,
                "department": m.department,
                "created_at": m.created_at.isoformat() if m.created_at else None,
                "removed_at": m.deleted_at.isoformat() if m.deleted_at else None,
                "modules": sorted(grants_by_mem.get(m.id, {}).values(), key=lambda g: g["name"]),
                "last_login_at": seen.isoformat() if seen else None,
                "must_change_password": bool(u.force_password_reset),
                "locked": bool(locked_until and locked_until > now),
            }
        )
    total = len(rows)
    start = (page - 1) * per_page
    return {"data": rows[start : start + per_page], "total": total, "page": page, "per_page": per_page}


@router.get("/users/{user_id}")
async def get_tenant_user(
    user_id: uuid.UUID,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Detalhe de um usuário do tenant (gestor)."""
    mem = await get_membership(db, user_id, ctx.organization_id)
    if not mem or mem.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não pertence ao órgão")
    u = (
        await db.execute(
            select(User).where(User.id == user_id, User.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    return {
        "user_id": str(u.id),
        "membership_id": str(mem.id),
        "name": u.name,
        "email": u.email,
        "cpf": u.cpf,
        "phone": u.phone,
        "position": mem.position,
        "department": mem.department,
        "global_active": u.is_active,
        "membership_role": mem.membership_role,
        "membership_active": mem.is_active,
        "created_at": mem.created_at.isoformat() if mem.created_at else None,
        **(await _user_usage(db, ctx.organization_id, u)),
    }


async def _user_usage(db: AsyncSession, organization_id: uuid.UUID, u: User) -> dict:
    """Último login no órgão, último uso de cada módulo e estado da senha."""
    last_login = (
        await db.execute(
            select(func.max(AuditEvent.created_at)).where(
                AuditEvent.organization_id == organization_id,
                AuditEvent.actor_id == u.id,
                AuditEvent.action == "login",
            )
        )
    ).scalar()
    slug_col = AuditEvent.details["module_slug"].as_string()
    usage = (
        await db.execute(
            select(slug_col, func.max(AuditEvent.created_at), func.count(AuditEvent.id))
            .where(
                AuditEvent.organization_id == organization_id,
                AuditEvent.actor_id == u.id,
                AuditEvent.action == "module_access",
            )
            # Agrupa pela posição: repetir a expressão JSON geraria outro parâmetro
            # e o Postgres não a reconheceria como a mesma coluna do SELECT.
            .group_by(literal_column("1"))
        )
    ).all()
    locked_until = u.locked_until
    if locked_until is not None and locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    return {
        "last_login_at": last_login.isoformat() if last_login else None,
        "module_usage": {
            slug: {"last_access_at": at.isoformat() if at else None, "count": n}
            for slug, at, n in usage
            if slug
        },
        "must_change_password": bool(u.force_password_reset),
        "password_changed_at": u.password_changed_at.isoformat() if u.password_changed_at else None,
        "locked": bool(locked_until and locked_until > datetime.now(timezone.utc)),
    }


@router.patch("/users/{user_id}/profile")
async def update_tenant_user_profile(
    user_id: uuid.UUID,
    body: MemberProfileUpdate,
    request: Request,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Edita o cadastro completo de um usuário do tenant (gestor).

    Dados globais (name, email, phone, cpf) são preservados entre tenants e só
    são alterados quando fornecidos. Dados do vínculo (position, department,
    membership_role, is_active) são específicos do membership. A alteração de
    e-mail/CPF exige que o valor não esteja em uso por outro usuário ativo.
    """
    mem = await get_membership(db, user_id, ctx.organization_id)
    if not mem or mem.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não pertence ao órgão")
    u = (
        await db.execute(
            select(User).where(User.id == user_id, User.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")

    before = {
        "name": u.name,
        "email": u.email,
        "phone": u.phone,
        "cpf": u.cpf,
        "position": mem.position,
        "department": mem.department,
        "membership_role": mem.membership_role,
        "is_active": mem.is_active,
    }

    new_role = body.membership_role if body.membership_role is not None else mem.membership_role
    new_active = body.is_active if body.is_active is not None else mem.is_active
    if new_role not in ("ORG_ADMIN", "ORG_MEMBER"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid membership_role")
    if new_role == "ORG_ADMIN" and mem.membership_role != "ORG_ADMIN" and not ctx.is_manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can grant manager role")

    # proteção do último gestor ativo quando perfil/status efetivamente mudam
    if new_role != mem.membership_role or new_active != mem.is_active:
        admins = (
            await db.execute(
                select(func.count(OrganizationMembership.id)).where(
                    OrganizationMembership.organization_id == ctx.organization_id,
                    OrganizationMembership.membership_role == "ORG_ADMIN",
                    OrganizationMembership.is_active.is_(True),
                    OrganizationMembership.deleted_at.is_(None),
                )
            )
        ).scalar() or 0
        if would_remove_last_active_manager(
            admins,
            target_is_active_manager=(mem.membership_role == "ORG_ADMIN" and mem.is_active),
            actor_is_target=(ctx.membership_id == mem.id),
            new_role_is_manager=(new_role == "ORG_ADMIN" and new_active),
        ):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                detail="Não é possível remover o último gestor ativo")

    if body.name is not None:
        body.name = body.name.strip()
        if not body.name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nome não pode ser vazio")
        u.name = body.name
    if body.email is not None:
        email = body.email.strip().lower()
        if not email:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="E-mail não pode ser vazio")
        if email != u.email:
            dup_email = (
                await db.execute(
                    select(User).where(
                        User.email == email,
                        User.deleted_at.is_(None),
                        User.id != user_id,
                    )
                )
            ).scalar_one_or_none()
            if dup_email:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                    detail="E-mail já está em uso por outro usuário")
        u.email = email
    if body.phone is not None:
        u.phone = body.phone.strip() or None
    if body.cpf is not None:
        cpf = body.cpf.strip() or None
        if cpf and cpf != u.cpf:
            dup_cpf = (
                await db.execute(
                    select(User).where(
                        User.cpf == cpf,
                        User.deleted_at.is_(None),
                        User.id != user_id,
                    )
                )
            ).scalar_one_or_none()
            if dup_cpf:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                    detail="CPF já está em uso por outro usuário")
        u.cpf = cpf
    if body.position is not None:
        mem.position = body.position.strip() or None
    if body.department is not None:
        mem.department = body.department.strip() or None

    mem.membership_role = new_role
    mem.is_active = new_active
    mem.status = "active" if new_active else "inactive"
    mem.updated_by = ctx.user.id
    after = {
        "name": u.name,
        "email": u.email,
        "phone": u.phone,
        "cpf": u.cpf,
        "position": mem.position,
        "department": mem.department,
        "membership_role": mem.membership_role,
        "is_active": mem.is_active,
    }

    await _log(db, request, ctx, "membership_profile_update", "user", resource_id=str(user_id),
               details={"before": before, "after": after})
    await db.commit()

    return {
        "user_id": str(user_id),
        "name": u.name,
        "email": u.email,
        "phone": u.phone,
        "cpf": u.cpf,
        "position": mem.position,
        "department": mem.department,
        "membership_role": mem.membership_role,
        "is_active": mem.is_active,
    }


async def _grant_membership(
    db: AsyncSession, membership_id: uuid.UUID, grants: dict[str, list[str]], created_by: uuid.UUID
) -> None:
    for slug, role_names in grants.items():
        for role in dict.fromkeys(normalize_grant_role(slug, r) for r in role_names):
            db.add(
                MembershipModuleGrant(
                    membership_id=membership_id,
                    module_slug=slug,
                    role_name=role,
                    is_active=True,
                    source="TENANT_MANAGER",
                    requires_review=False,
                    created_by=created_by,
                )
            )


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_tenant_user(
    body: MemberCreate,
    request: Request,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    if body.membership_role not in ("ORG_ADMIN", "ORG_MEMBER"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid membership_role")
    if body.membership_role == "ORG_ADMIN" and not ctx.is_manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can grant manager role")

    grants = body.grants or {}

    # valida os módulos contratados e roles antes de criar (evita estado parcial)
    for slug, role_names in grants.items():
        if not await org_has_module(db, ctx.organization_id, slug):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                                detail=f"Módulo '{slug}' não contratado pelo órgão")
        for role in role_names:
            if not is_valid_grant(slug, role):
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                                    detail=f"Role inválida '{role}' para módulo '{slug}'")

    existing = (
        await db.execute(select(User).where(User.email == body.email, User.deleted_at.is_(None)))
    ).scalar_one_or_none()

    if existing:
        # vínculo de identidade existente: cria APENAS o membership, preserva senha.
        dup = await get_membership(db, existing.id, ctx.organization_id)
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Usuário já pertence ao órgão")
        mem = OrganizationMembership(
            organization_id=ctx.organization_id,
            user_id=existing.id,
            membership_role=body.membership_role,
            status="active" if body.is_active else "inactive",
            is_active=body.is_active,
            position=body.position.strip() or None if body.position else None,
            department=body.department.strip() or None if body.department else None,
            created_by=ctx.user.id,
        )
        db.add(mem)
        await db.flush()
        await _grant_membership(db, mem.id, grants, ctx.user.id)
        await _log(db, request, ctx, "membership_create", "organization_membership",
                   resource_id=str(mem.id), details={"user_id": str(existing.id), "role": body.membership_role})
        await db.commit()
        return {"status": "linked", "user_id": str(existing.id)}

    # novo usuário global no tenant
    user = User(
        organization_id=ctx.organization_id,
        name=body.name,
        email=body.email,
        password_hash=None,  # sem senha definida -> fluxo de convite/redefinição
        is_active=True,
        force_password_reset=body.force_password_reset,
        phone=body.phone.strip() or None if body.phone else None,
        cpf=body.cpf.strip() or None if body.cpf else None,
    )
    db.add(user)
    await db.flush()
    mem = OrganizationMembership(
        organization_id=ctx.organization_id,
        user_id=user.id,
        membership_role=body.membership_role,
        status="active" if body.is_active else "inactive",
        is_active=body.is_active,
        position=body.position.strip() or None if body.position else None,
        department=body.department.strip() or None if body.department else None,
        created_by=ctx.user.id,
    )
    db.add(mem)
    await db.flush()
    await _grant_membership(db, mem.id, grants, ctx.user.id)
    await _log(db, request, ctx, "user_create", "user", resource_id=str(user.id),
               details={"email": user.email, "role": body.membership_role, "grants": grants})
    await db.commit()
    return {"status": "created", "user_id": str(user.id)}


@router.get("/users/{user_id}/grants")
async def get_user_grants(
    user_id: uuid.UUID,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    mem = await get_membership(db, user_id, ctx.organization_id)
    if not mem or mem.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não pertence ao órgão")
    grants: dict[str, list[str]] = {}
    pending: list[str] = []
    for g in await get_membership_grants(db, mem.id):
        if g.requires_review or g.role_name.startswith("__"):
            pending.append(g.module_slug)
            continue
        grants.setdefault(g.module_slug, []).append(g.role_name)
    return {"grants": grants, "pending_review": sorted(set(pending))}


@router.put("/users/{user_id}/grants")
async def set_user_grants(
    user_id: uuid.UUID,
    body: GrantsBody,
    request: Request,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    mem = await get_membership(db, user_id, ctx.organization_id)
    if not mem or mem.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não pertence ao órgão")

    # valida módulos contratados pelo tenant e roles do catálogo
    for slug, role_names in body.grants.items():
        if not await org_has_module(db, ctx.organization_id, slug):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                                detail=f"Módulo '{slug}' não contratado pelo órgão")
        for role in role_names:
            if not is_valid_grant(slug, role):
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                                    detail=f"Role inválida '{role}' para módulo '{slug}'")

    # substituição do conjunto de grants do membership.
    # Soft-delete nas linhas antigas (deleted_at + is_active=False) em vez de
    # db.delete(): o índice único é parcial (WHERE deleted_at IS NULL), então
    # soft-delete libera a chave para o INSERT do novo grant com mesmo
    # (membership, module_slug, role_name) sem race de autoflush INSERT→DELETE.
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    existing = await get_membership_grants(db, mem.id)
    for g in existing:
        if not g.requires_review and not g.role_name.startswith("__"):
            g.is_active = False
            g.deleted_at = g.deleted_at or now
            g.updated_by = ctx.user.id
    await db.flush()

    for slug, role_names in body.grants.items():
        for role in dict.fromkeys(normalize_grant_role(slug, r) for r in role_names):
            db.add(
                MembershipModuleGrant(
                    membership_id=mem.id,
                    module_slug=slug,
                    role_name=role,
                    is_active=True,
                    source="TENANT_MANAGER",
                    requires_review=False,
                    created_by=ctx.user.id,
                )
            )

    # Revogação de acesso: invalida sessões SSO ativas do membership para que
    # a retirada/alteração de role tenha efeito sem depender da expiração do token.
    revoked = (
        await db.execute(
            select(SsoSession).where(
                SsoSession.user_id == user_id,
                SsoSession.organization_id == ctx.organization_id,
                SsoSession.is_active.is_(True),
            )
        )
    ).scalars().all()
    for s in revoked:
        s.is_active = False
        s.used_at = s.used_at or datetime.now(timezone.utc).replace(tzinfo=None)

    await _log(db, request, ctx, "grants_update", "user_grants", resource_id=str(user_id),
               details={"grants": body.grants, "sessions_revoked": len(revoked)})
    await db.commit()
    await _sync_grants_to_modules(db, user_id, mem, ctx.organization_id, body.grants)
    return {"grants": body.grants, "sessions_revoked": len(revoked)}


async def _sync_grants_to_modules(
    db: AsyncSession,
    user_id: uuid.UUID,
    mem: OrganizationMembership,
    organization_id: uuid.UUID,
    grants: dict[str, list[str]],
) -> None:
    """Avisa os módulos na hora, para a pessoa já aparecer lá sem precisar entrar.

    Mesmo contrato do login no módulo (/auth/module-access). Falha de um módulo
    só gera log: o acesso já está salvo e será sincronizado no primeiro login.
    """
    from app.api.v1.auth import _sync_to_module

    user = await db.get(User, user_id)
    if not user or not settings.INTERNAL_API_KEY.get_secret_value():
        return
    module_urls = {
        "diario": settings.DIARIO_MODULE_INTERNAL_API_URL,
        "chatgov": settings.CHATGOV_MODULE_INTERNAL_API_URL,
        "govtask": settings.GOVTASK_MODULE_INTERNAL_API_URL,
        "govavalia": settings.GOVAVALIA_MODULE_INTERNAL_API_URL,
        "govsocial": settings.GOVSOCIAL_MODULE_INTERNAL_API_URL,
        "govdoc": settings.GOVDOC_MODULE_INTERNAL_API_URL,
        "govfrota": settings.GOVFROTA_MODULE_INTERNAL_API_URL,
    }
    base_roles = ["ORG_MEMBER"]
    if mem.membership_role == "ORG_ADMIN":
        base_roles.append("ADMIN")
    for slug, role_names in grants.items():
        api_url = module_urls.get(slug)
        if not api_url or not role_names:
            continue
        roles = list(dict.fromkeys(base_roles + [normalize_grant_role(slug, r) for r in role_names]))
        await _sync_to_module(slug, api_url, user, organization_id, roles, db)


@router.patch("/users/{user_id}/status")
async def update_membership_status(
    user_id: uuid.UUID,
    body: MemberUpdate,
    request: Request,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    mem = await get_membership(db, user_id, ctx.organization_id)
    if not mem or mem.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não pertence ao órgão")

    new_role = body.membership_role if body.membership_role is not None else mem.membership_role
    new_active = body.is_active if body.is_active is not None else mem.is_active

    # proteção do último gestor ativo
    admins = (
        await db.execute(
            select(func.count(OrganizationMembership.id)).where(
                OrganizationMembership.organization_id == ctx.organization_id,
                OrganizationMembership.membership_role == "ORG_ADMIN",
                OrganizationMembership.is_active.is_(True),
                OrganizationMembership.deleted_at.is_(None),
            )
        )
    ).scalar() or 0
    if would_remove_last_active_manager(
        admins,
        target_is_active_manager=(mem.membership_role == "ORG_ADMIN" and mem.is_active),
        actor_is_target=(ctx.membership_id == mem.id),
        new_role_is_manager=(new_role == "ORG_ADMIN" and new_active),
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Não é possível remover o último gestor ativo")

    mem.membership_role = new_role
    mem.is_active = new_active
    mem.status = "active" if new_active else "inactive"
    mem.updated_by = ctx.user.id

    await _log(db, request, ctx, "membership_update", "organization_membership",
               resource_id=str(mem.id), details={"role": new_role, "is_active": new_active})
    await db.commit()
    return {"user_id": str(user_id), "membership_role": new_role, "is_active": new_active}


@router.post("/users/{user_id}/password-reset")
async def request_password_reset(
    user_id: uuid.UUID,
    request: Request,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    mem = await get_membership(db, user_id, ctx.organization_id)
    if not mem or mem.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não pertence ao órgão")
    # marca força troca de senha no próximo acesso (não expõe senha atual)
    mem.user.force_password_reset = True
    await _log(db, request, ctx, "password_reset_requested", "user", resource_id=str(user_id))
    await db.commit()
    return {"status": "reset_required"}


class TenantPasswordSet(BaseModel):
    password: str
    # Senha provisória: obriga a pessoa a criar a própria no próximo acesso.
    require_change: bool = False

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        import re as _re
        if len(v) < 8:
            raise ValueError("A senha deve ter no mínimo 8 caracteres")
        if len(v) > 72:
            raise ValueError("A senha deve ter no máximo 72 caracteres")
        if not _re.search(r"[A-Z]", v):
            raise ValueError("A senha deve conter ao menos uma letra maiúscula")
        if not _re.search(r"[a-z]", v):
            raise ValueError("A senha deve conter ao menos uma letra minúscula")
        if not _re.search(r"[0-9]", v):
            raise ValueError("A senha deve conter ao menos um número")
        if not _re.search(r"[^A-Za-z0-9]", v):
            raise ValueError("A senha deve conter ao menos um caractere especial")
        return v


@router.post("/users/{user_id}/password")
async def set_tenant_user_password(
    user_id: uuid.UUID,
    body: TenantPasswordSet,
    request: Request,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Gestor define uma nova senha para o usuário do órgão (redefinição direta).

    Permite ao gestor recuperar o acesso de um usuário que esqueceu a senha,
    definindo uma nova senha e invalidando o flag de troca no próximo acesso,
    sem depender de o usuário estar logado.
    """
    mem = await get_membership(db, user_id, ctx.organization_id)
    if not mem or mem.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não pertence ao órgão")

    mem.user.password_hash = hash_password(body.password)
    mem.user.password_changed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    mem.user.password_failures = 0
    mem.user.locked_until = None
    mem.user.force_password_reset = body.require_change

    await _log(db, request, ctx, "password_set_by_manager", "user", resource_id=str(user_id),
               details={"require_change": body.require_change})
    await _revoke_user_sessions(db, user_id, ctx.organization_id)
    await db.commit()
    return {"status": "password_set"}


@router.post("/users/{user_id}/force-password-reset")
async def force_tenant_user_password_reset(
    user_id: uuid.UUID,
    request: Request,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Obriga o usuário a trocar a senha no próximo acesso (gestor)."""
    mem = await get_membership(db, user_id, ctx.organization_id)
    if not mem or mem.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não pertence ao órgão")
    mem.user.force_password_reset = True
    await _log(db, request, ctx, "force_password_reset", "user", resource_id=str(user_id))
    await db.commit()
    return {"status": "force_password_reset_required"}


async def _revoke_user_sessions(
    db: AsyncSession, user_id: uuid.UUID, organization_id: uuid.UUID
) -> int:
    """Revoga (invalida) as sessões SSO ativas de um usuário no tenant."""
    rows = (
        await db.execute(
            select(SsoSession).where(
                SsoSession.user_id == user_id,
                SsoSession.organization_id == organization_id,
                SsoSession.is_active.is_(True),
            )
        )
    ).scalars().all()
    for s in rows:
        s.is_active = False
        s.used_at = s.used_at or datetime.now(timezone.utc).replace(tzinfo=None)
    return len(rows)


@router.post("/users/{user_id}/revoke-sessions")
async def revoke_tenant_user_sessions(
    user_id: uuid.UUID,
    request: Request,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Revoga todas as sessões de módulo de um usuário neste tenant (gestor)."""
    mem = await get_membership(db, user_id, ctx.organization_id)
    if not mem or mem.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não pertence ao órgão")
    revoked = await _revoke_user_sessions(db, user_id, ctx.organization_id)
    await _log(db, request, ctx, "sessions_revoked", "user", resource_id=str(user_id),
               details={"sessions": revoked})
    await db.commit()
    return {"status": "sessions_revoked", "revoked": revoked}


@router.delete("/users/{user_id}", status_code=status.HTTP_200_OK)
async def remove_tenant_user(
    user_id: uuid.UUID,
    request: Request,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Remove um usuário DO ÓRGÃO (soft delete do membership).

    Não apaga a identidade global (preserva outros tenants, histórico, senha).
    Revoga grants e sessões do tenant. Protege o último gestor ativo e
    impede a autoexclusão que deixe o órgão sem gestor.
    """
    mem = await get_membership(db, user_id, ctx.organization_id)
    if not mem or mem.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não pertence ao órgão")

    # proteção do último gestor ativo
    admins = (
        await db.execute(
            select(func.count(OrganizationMembership.id)).where(
                OrganizationMembership.organization_id == ctx.organization_id,
                OrganizationMembership.membership_role == "ORG_ADMIN",
                OrganizationMembership.is_active.is_(True),
                OrganizationMembership.deleted_at.is_(None),
            )
        )
    ).scalar() or 0
    if would_remove_last_active_manager(
        admins,
        target_is_active_manager=(mem.membership_role == "ORG_ADMIN" and mem.is_active),
        actor_is_target=(ctx.membership_id == mem.id),
        new_role_is_manager=False,
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Não é possível remover o último gestor ativo")

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # revoga grants do membership
    for g in await get_membership_grants(db, mem.id):
        g.is_active = False
        g.deleted_at = g.deleted_at or now
        g.updated_by = ctx.user.id

    # revoga sessões do tenant
    revoked = await _revoke_user_sessions(db, user_id, ctx.organization_id)

    mem.is_active = False
    mem.status = "removed"
    mem.deleted_at = mem.deleted_at or now
    mem.updated_by = ctx.user.id

    await _log(db, request, ctx, "membership_removed", "organization_membership",
               resource_id=str(mem.id), details={"user_id": str(user_id), "sessions_revoked": revoked})
    await db.commit()
    return {"status": "removed", "user_id": str(user_id), "sessions_revoked": revoked}


@router.post("/users/{user_id}/restore")
async def restore_tenant_user(
    user_id: uuid.UUID,
    request: Request,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Restaura um membership removido (gestor). Reativa vínculo e grants."""
    mem = (
        await db.execute(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id == user_id,
                OrganizationMembership.organization_id == ctx.organization_id,
            )
        )
    ).scalar_one_or_none()
    if not mem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vínculo não encontrado")

    mem.deleted_at = None
    mem.is_active = True
    mem.status = "active"
    mem.updated_by = ctx.user.id
    for g in mem.grants:
        g.deleted_at = None
        g.is_active = True

    await _log(db, request, ctx, "membership_restored", "organization_membership",
               resource_id=str(mem.id), details={"user_id": str(user_id)})
    await db.commit()
    return {"status": "restored", "user_id": str(user_id)}


@router.get("/users/{user_id}/audit")
async def tenant_user_audit(
    user_id: uuid.UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Histórico de auditoria de um usuário do tenant (gestor)."""
    mem = await get_membership(db, user_id, ctx.organization_id)
    if not mem or mem.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não pertence ao órgão")

    # O que a pessoa fez (actor) e o que fizeram com ela (resource / details.user_id).
    about_user = or_(
        AuditEvent.actor_id == user_id,
        AuditEvent.resource_id.in_([str(user_id), str(mem.id)]),
        AuditEvent.details["user_id"].as_string() == str(user_id),
    )
    where = (
        AuditEvent.organization_id == ctx.organization_id,
        AuditEvent.action.notin_(_FEED_NOISE),
        about_user,
    )
    q = select(AuditEvent).where(*where).order_by(desc(AuditEvent.created_at))
    total = (await db.execute(select(func.count(AuditEvent.id)).where(*where))).scalar() or 0
    rows = (await db.execute(q.offset((page - 1) * per_page).limit(per_page))).scalars().all()

    return {
        "data": await _enrich_activity(db, rows),
        "total": total,
        "page": page,
        "per_page": per_page,
    }


# ---------------------------------------------------------------------------
# Auditoria do tenant (gestor)
# ---------------------------------------------------------------------------
# Categorias da auditoria (mesma divisão usada no feed do portal).
_SECURITY_ACTIONS = [
    "password_reset_requested", "password_reset", "force_password_reset", "password_changed",
    "change_password", "password_set_by_manager", "sessions_revoked", "module_access_failed",
]
_ACCESS_ACTIONS = ["login", "logout", "module_access"]


def _audit_category(category: str):
    # coalesce: com resource_type NULL a comparação daria NULL e o evento
    # sumiria de todas as categorias (e do total).
    rtype = func.coalesce(AuditEvent.resource_type, "")
    security = AuditEvent.action.in_(_SECURITY_ACTIONS)
    access = AuditEvent.action.in_(_ACCESS_ACTIONS)
    grants = or_(
        rtype == "user_grants",
        AuditEvent.action.like("grant\\_%"),
        AuditEvent.action.in_(["grants_update", "pending_grant_approved"]),
    )
    users = or_(
        rtype == "user",
        AuditEvent.action.like("membership\\_%"),
        AuditEvent.action == "user_create",
    )
    if category == "security":
        return security
    if category == "access":
        return access
    if category == "grants":
        return grants & ~security & ~access
    if category == "users":
        return users & ~grants & ~security & ~access
    if category == "other":
        return ~security & ~access & ~grants & ~users
    return None


@router.get("/audit")
async def tenant_audit(
    action: str | None = Query(None),
    q: str | None = Query(None, description="Busca no nome ou e-mail de quem fez"),
    module: str | None = Query(None),
    category: str | None = Query(None, pattern="^(access|users|grants|security|other)$"),
    actor_id: uuid.UUID | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    base_conds = [
        AuditEvent.organization_id == ctx.organization_id,
        AuditEvent.action.notin_(_FEED_NOISE),
    ]
    if action:
        base_conds.append(AuditEvent.action == action)
    if module:
        base_conds.append(
            or_(
                AuditEvent.details["module_slug"].as_string() == module,
                AuditEvent.details["module"].as_string() == module,
            )
        )
    if actor_id:
        base_conds.append(AuditEvent.actor_id == actor_id)
    if date_from:
        base_conds.append(AuditEvent.created_at >= date_from)
    if date_to:
        base_conds.append(AuditEvent.created_at < date_to)
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        by_name = select(User.id).where(func.lower(User.name).like(like))
        base_conds.append(
            or_(func.lower(AuditEvent.actor_email).like(like), AuditEvent.actor_id.in_(by_name))
        )

    # Contagem por categoria com os demais filtros aplicados (para os chips).
    counts: dict[str, int] = {}
    for cat in ("access", "users", "grants", "security", "other"):
        counts[cat] = (
            await db.execute(
                select(func.count(AuditEvent.id)).where(*base_conds, _audit_category(cat))
            )
        ).scalar() or 0
    counts["all"] = sum(counts.values())

    conds = list(base_conds)
    if category:
        conds.append(_audit_category(category))
    total = counts[category] if category else counts["all"]
    rows = (
        await db.execute(
            select(AuditEvent)
            .where(*conds)
            .order_by(desc(AuditEvent.created_at))
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
    ).scalars().all()
    enriched = await _enrich_activity(db, rows)
    agents = {str(e.id): e.user_agent for e in rows}
    for item in enriched:
        item["user_agent"] = agents.get(item["id"])
    return {"data": enriched, "total": total, "counts": counts, "page": page, "per_page": per_page}


# ---------------------------------------------------------------------------
# Segurança e sessões do tenant (usuário autenticado)
# ---------------------------------------------------------------------------
@router.get("/security")
async def tenant_security(
    ctx: TenantContext = Depends(get_tenant_context),
):
    """Postura de segurança do usuário no tenant autenticado."""
    return {
        "organization_slug": ctx.organization.slug,
        "membership_role": ctx.membership.membership_role,
        "membership_active": ctx.membership.is_active,
        "position": ctx.membership.position,
        "department": ctx.membership.department,
        "member_since": ctx.membership.created_at.isoformat() if ctx.membership.created_at else None,
        "global_active": ctx.user.is_active,
        "mfa_enabled": ctx.user.mfa_enabled,
        "force_password_reset": getattr(ctx.user, "force_password_reset", False),
        "password_changed_at": (
            ctx.user.password_changed_at.isoformat() if ctx.user.password_changed_at else None
        ),
    }


@router.get("/sessions")
async def tenant_sessions(
    limit: int = Query(50, ge=1, le=200),
    ctx: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
):
    """Sessões SSO ativas do usuário neste tenant."""
    rows = (
        await db.execute(
            select(SsoSession)
            .where(
                SsoSession.user_id == ctx.user.id,
                SsoSession.organization_id == ctx.organization_id,
                SsoSession.is_active.is_(True),
                SsoSession.expires_at > func.now(),
            )
            .order_by(desc(SsoSession.expires_at))
            .limit(limit)
        )
    ).scalars().all()
    return {
        "data": [
            {
                "id": str(s.id),
                "module_slug": s.module_slug,
                "expires_at": s.expires_at.isoformat() if s.expires_at else None,
                "used_at": s.used_at.isoformat() if s.used_at else None,
                "redirect_url": s.redirect_url,
                "is_active": s.is_active,
            }
            for s in rows
        ],
        "count": len(rows),
    }


# ---------------------------------------------------------------------------
# Gestão por módulo (gestor)
# ---------------------------------------------------------------------------
@router.get("/contracted-modules")
async def tenant_contracted_modules(
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Todos os módulos contratados pelo órgão, com stats (usuários, roles,
    pendências, status) — para a página 'Módulos contratados' do gestor."""
    rows = (
        await db.execute(
            select(Module)
            .join(OrganizationModule, OrganizationModule.module_id == Module.id)
            .where(
                OrganizationModule.organization_id == ctx.organization_id,
                OrganizationModule.is_active.is_(True),
                Module.is_active.is_(True),
            )
            .order_by(Module.name)
        )
    ).scalars().all()

    mem_ids = (
        await db.execute(
            select(OrganizationMembership.id).where(
                OrganizationMembership.organization_id == ctx.organization_id,
                OrganizationMembership.deleted_at.is_(None),
            )
        )
    ).scalars().all()

    active_mem_ids = set(
        (
            await db.execute(
                select(OrganizationMembership.id).where(
                    OrganizationMembership.organization_id == ctx.organization_id,
                    OrganizationMembership.deleted_at.is_(None),
                    OrganizationMembership.is_active.is_(True),
                )
            )
        ).scalars().all()
    )

    # grants por módulo (neste tenant): pessoas distintas, perfis em uso e pendências
    grant_rows = (
        await db.execute(
            select(
                MembershipModuleGrant.module_slug,
                MembershipModuleGrant.membership_id,
                MembershipModuleGrant.role_name,
                MembershipModuleGrant.requires_review,
            ).where(
                MembershipModuleGrant.membership_id.in_(list(mem_ids)),
                MembershipModuleGrant.deleted_at.is_(None),
                MembershipModuleGrant.is_active.is_(True),
            )
        )
    ).all()
    pending_enabled = await is_flag(db, "MEMBERSHIP_GRANTS_V2_ENABLED")
    people: dict[str, set] = {}
    roles_in_use: dict[str, dict[str, int]] = {}
    pending_by_mod: dict[str, int] = {}
    for slug, mem_id, role, review in grant_rows:
        if review:
            pending_by_mod[slug] = pending_by_mod.get(slug, 0) + 1
        if role.startswith("__"):
            continue
        if mem_id in active_mem_ids:
            people.setdefault(slug, set()).add(mem_id)
            roles_in_use.setdefault(slug, {})
            roles_in_use[slug][role] = roles_in_use[slug].get(role, 0) + 1

    # Uso nos últimos 30 dias (aberturas do módulo por pessoas do órgão).
    since = datetime.now(timezone.utc) - timedelta(days=30)
    slug_col = AuditEvent.details["module_slug"].as_string()
    usage = {
        slug: (n, users, last)
        for slug, n, users, last in (
            await db.execute(
                select(
                    slug_col,
                    func.count(AuditEvent.id),
                    func.count(func.distinct(AuditEvent.actor_id)),
                    func.max(AuditEvent.created_at),
                )
                .where(
                    AuditEvent.organization_id == ctx.organization_id,
                    AuditEvent.action == "module_access",
                    AuditEvent.created_at >= since,
                )
                .group_by(literal_column("1"))
            )
        ).all()
        if slug
    }

    result = []
    for mod in rows:
        n, users_30d, last = usage.get(mod.slug, (0, 0, None))
        result.append(
            {
                "slug": mod.slug,
                "name": mod.name,
                "description": mod.description,
                "icon": mod.icon,
                "version": mod.version,
                "is_active": mod.is_active,
                "status": "Operacional" if mod.is_active else "Indisponível",
                "module_url": _resolve_module_url(mod),
                "users_with_grant": len(people.get(mod.slug, set())),
                "roles_in_use": sorted(roles_in_use.get(mod.slug, {})),
                "roles_count": roles_in_use.get(mod.slug, {}),
                "pending_review": pending_by_mod.get(mod.slug, 0) if pending_enabled else 0,
                "accesses_30d": n,
                "active_users_30d": users_30d,
                "last_access_at": last.isoformat() if last else None,
            }
        )
    return result


@router.get("/modules/{module_slug}/users")
async def tenant_module_users(
    module_slug: str,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Usuários do tenant com acesso a um módulo (gestor)."""
    if not await org_has_module(db, ctx.organization_id, module_slug):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Módulo não contratado pelo órgão")

    mems = (
        await db.execute(
            select(OrganizationMembership, User)
            .join(User, User.id == OrganizationMembership.user_id)
            .where(
                OrganizationMembership.organization_id == ctx.organization_id,
                OrganizationMembership.deleted_at.is_(None),
                User.deleted_at.is_(None),
            )
            .order_by(User.name)
        )
    ).all()

    grants_by_mem: dict[uuid.UUID, list] = {}
    if mems:
        for g in (
            await db.execute(
                select(MembershipModuleGrant).where(
                    MembershipModuleGrant.membership_id.in_([m.id for m, _ in mems]),
                    MembershipModuleGrant.module_slug == module_slug,
                    MembershipModuleGrant.deleted_at.is_(None),
                    MembershipModuleGrant.is_active.is_(True),
                )
            )
        ).scalars().all():
            grants_by_mem.setdefault(g.membership_id, []).append(g)

    last_use = dict(
        (
            await db.execute(
                select(AuditEvent.actor_id, func.max(AuditEvent.created_at))
                .where(
                    AuditEvent.organization_id == ctx.organization_id,
                    AuditEvent.action == "module_access",
                    AuditEvent.details["module_slug"].as_string() == module_slug,
                )
                .group_by(AuditEvent.actor_id)
            )
        ).all()
    )

    result = []
    for mem, u in mems:
        grants = grants_by_mem.get(mem.id, [])
        roles = [g.role_name for g in grants if g.role_name and not g.role_name.startswith("__")]
        seen = last_use.get(u.id)
        result.append(
            {
                "user_id": str(u.id),
                "membership_id": str(mem.id),
                "name": u.name,
                "email": u.email,
                "position": mem.position,
                "department": mem.department,
                "membership_active": mem.is_active,
                "roles": sorted(set(roles)),
                "requires_review": any(g.requires_review for g in grants),
                # Antes a tela contava todos os membros como "com acesso".
                "has_access": bool(grants),
                "last_access_at": seen.isoformat() if seen else None,
            }
        )
    return {"module_slug": module_slug, "users": result}


# ---------------------------------------------------------------------------
# Grants pendentes de revisão (legado migrado) — painel do gestor
# ---------------------------------------------------------------------------
@router.get("/pending-grants")
async def list_pending_grants(
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Lista todos os grants com requires_review=True no tenant, agrupados
    por módulo. Esses são permissões legadas (MIGRATED_LEGACY) ou genéricas
    (MIGRATED_GRANT) que o gestor precisa revisar e atribuir roles concretas."""
    rows = (
        await db.execute(
            select(
                MembershipModuleGrant,
                OrganizationMembership,
                User,
                Module,
            )
            .join(OrganizationMembership, OrganizationMembership.id == MembershipModuleGrant.membership_id)
            .join(User, User.id == OrganizationMembership.user_id)
            .join(Module, Module.slug == MembershipModuleGrant.module_slug)
            .where(
                MembershipModuleGrant.requires_review.is_(True),
                OrganizationMembership.organization_id == ctx.organization_id,
                OrganizationMembership.deleted_at.is_(None),
                User.deleted_at.is_(None),
                # inclui registros já soft-deletados para mostrar histórico de
                # grants que ficaram pendentes após uma tentativa de save
                MembershipModuleGrant.deleted_at.is_(None),
            )
            .order_by(Module.name, User.name)
        )
    ).all()

    by_module: dict[str, dict] = {}
    for g, m, u, mod in rows:
        bucket = by_module.setdefault(
            mod.slug,
            {
                "slug": mod.slug,
                "name": mod.name,
                "version": mod.version,
                "count": 0,
                "items": [],
            },
        )
        bucket["count"] += 1
        bucket["items"].append(
            {
                "grant_id": str(g.id),
                "user_id": str(u.id),
                "user_name": u.name,
                "user_email": u.email,
                "membership_id": str(m.id),
                "role_name": g.role_name,
                "source": g.source,
                "created_at": g.created_at.isoformat() if g.created_at else None,
            }
        )

    return {
        "total": sum(b["count"] for b in by_module.values()),
        "modules": list(by_module.values()),
    }


@router.post("/pending-grants/dismiss-all")
async def dismiss_all_pending_grants(
    request: Request,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Rejeita em massa todos os grants pendentes do tenant.
    Faz soft-delete (is_active=False, deleted_at=now) em todos os registros
    com requires_review=True. Útil quando o gestor decide que nenhuma das
    permissões legadas deve ser propagada."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = (
        await db.execute(
            select(MembershipModuleGrant)
            .join(OrganizationMembership, OrganizationMembership.id == MembershipModuleGrant.membership_id)
            .where(
                MembershipModuleGrant.requires_review.is_(True),
                MembershipModuleGrant.deleted_at.is_(None),
                OrganizationMembership.organization_id == ctx.organization_id,
            )
        )
    ).scalars().all()
    for g in rows:
        g.is_active = False
        g.deleted_at = g.deleted_at or now
        g.updated_by = ctx.user.id

    await _log(db, request, ctx, "pending_grants_dismissed", "user_grants",
               resource_id=str(ctx.organization_id),
               details={"dismissed": len(rows)})
    await db.commit()
    return {"dismissed": len(rows)}


@router.post("/pending-grants/{grant_id}/approve")
async def approve_pending_grant(
    grant_id: uuid.UUID,
    request: Request,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Aprova um grant pendente, marcando-o como revisado (requires_review=False)
    e atribuindo a role segura padrão (LEGACY_SAFE_ROLE) se o role_name
    começar com __ (placeholder). Se a role já for concreta, apenas limpa o
    flag de revisão."""
    g = (
        await db.execute(
            select(MembershipModuleGrant)
            .where(
                MembershipModuleGrant.id == grant_id,
                MembershipModuleGrant.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grant pendente não encontrado")

    # valida tenant
    mem = (
        await db.execute(
            select(OrganizationMembership).where(
                OrganizationMembership.id == g.membership_id,
                OrganizationMembership.organization_id == ctx.organization_id,
            )
        )
    ).scalar_one_or_none()
    if not mem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grant não pertence ao órgão")

    # se for placeholder (__PENDING_LEGACY__), aplica a role segura padrão
    if g.role_name.startswith("__"):
        safe = LEGACY_SAFE_ROLE.get(g.module_slug)
        if not safe:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Sem role segura padrão para o módulo '{g.module_slug}'",
            )
        g.role_name = safe

    g.requires_review = False
    g.is_active = True
    g.updated_by = ctx.user.id

    await _log(db, request, ctx, "pending_grant_approved", "user_grants",
               resource_id=str(g.id),
               details={"module": g.module_slug, "role": g.role_name, "user_id": str(mem.user_id)})
    await db.commit()
    return {"grant_id": str(g.id), "role": g.role_name}


@router.post("/pending-grants/{grant_id}/dismiss")
async def dismiss_pending_grant(
    grant_id: uuid.UUID,
    request: Request,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Rejeita um grant pendente específico (soft delete)."""
    g = (
        await db.execute(
            select(MembershipModuleGrant)
            .where(
                MembershipModuleGrant.id == grant_id,
                MembershipModuleGrant.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grant pendente não encontrado")

    mem = (
        await db.execute(
            select(OrganizationMembership).where(
                OrganizationMembership.id == g.membership_id,
                OrganizationMembership.organization_id == ctx.organization_id,
            )
        )
    ).scalar_one_or_none()
    if not mem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grant não pertence ao órgão")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    g.is_active = False
    g.deleted_at = g.deleted_at or now
    g.updated_by = ctx.user.id

    await _log(db, request, ctx, "pending_grant_dismissed", "user_grants",
               resource_id=str(g.id),
               details={"module": g.module_slug, "user_id": str(mem.user_id)})
    await db.commit()
    return {"grant_id": str(g.id), "dismissed": True}


_ORG_EDITABLE = (
    "description", "email", "phone", "public_url",
    "address_zip", "address_street", "address_number", "address_complement",
    "address_neighborhood", "address_city", "address_state",
)


def _org_payload(org) -> dict:
    return {
        "organization_id": str(org.id),
        "slug": org.slug,
        "name": org.name,
        "cnpj": getattr(org, "cnpj", None),
        "logo_url": org.logo_url,
        "is_active": org.is_active,
        "created_at": org.created_at.isoformat() if org.created_at else None,
        "plan": None,
        **{f: getattr(org, f) for f in _ORG_EDITABLE},
    }


@router.get("/org")
async def tenant_org_info(
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Dados do órgão (gestor) — página 'Dados do órgão'."""
    org = ctx.organization
    mems = (
        await db.execute(
            select(OrganizationMembership, User)
            .join(User, User.id == OrganizationMembership.user_id)
            .where(
                OrganizationMembership.organization_id == ctx.organization_id,
                OrganizationMembership.deleted_at.is_(None),
                User.deleted_at.is_(None),
            )
            .order_by(User.name)
        )
    ).all()
    modules = (
        await db.execute(
            select(func.count(OrganizationModule.id)).where(
                OrganizationModule.organization_id == ctx.organization_id,
                OrganizationModule.is_active.is_(True),
            )
        )
    ).scalar() or 0
    return {
        **_org_payload(org),
        "stats": {
            "members_active": sum(1 for m, _ in mems if m.is_active),
            "members_total": len(mems),
            "modules_contracted": modules,
        },
        "managers": [
            {"user_id": str(u.id), "name": u.name, "email": u.email, "phone": u.phone}
            for m, u in mems
            if m.membership_role == "ORG_ADMIN" and m.is_active
        ],
    }


class OrgContactUpdate(BaseModel):
    """Dados de contato e endereço que o gestor pode manter. Nome, CNPJ e
    identificador são contratuais e ficam com a equipe da plataforma."""
    description: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    public_url: Optional[str] = None
    address_zip: Optional[str] = None
    address_street: Optional[str] = None
    address_number: Optional[str] = None
    address_complement: Optional[str] = None
    address_neighborhood: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None

    @field_validator("email")
    @classmethod
    def _email(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip().lower()
        if v and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", v):
            raise ValueError("E-mail inválido")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: Optional[str]) -> Optional[str]:
        d = re.sub(r"\D", "", v or "")
        if d and len(d) not in (10, 11):
            raise ValueError("Telefone deve ter DDD e 8 ou 9 dígitos")
        return d

    @field_validator("address_zip")
    @classmethod
    def _zip(cls, v: Optional[str]) -> Optional[str]:
        d = re.sub(r"\D", "", v or "")
        if d and len(d) != 8:
            raise ValueError("CEP deve ter 8 dígitos")
        return f"{d[:5]}-{d[5:]}" if d else ""

    @field_validator("address_state")
    @classmethod
    def _uf(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip().upper()
        if v and not re.fullmatch(r"[A-Z]{2}", v):
            raise ValueError("UF deve ter 2 letras")
        return v

    @field_validator("public_url")
    @classmethod
    def _url(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        if v and not re.match(r"^https?://", v):
            v = "https://" + v
        return v


@router.patch("/org")
async def tenant_org_update(
    body: OrgContactUpdate,
    request: Request,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Gestor atualiza contato e endereço do órgão. Campo ausente = não mexe;
    texto vazio = apaga."""
    org = ctx.organization
    before = {f: getattr(org, f) for f in _ORG_EDITABLE}
    for field in body.model_fields_set:
        value = getattr(body, field)
        value = value.strip() if isinstance(value, str) else value
        setattr(org, field, value or None)
    after = {f: getattr(org, f) for f in _ORG_EDITABLE}
    changed = [f for f in _ORG_EDITABLE if before[f] != after[f]]
    if changed:
        await _log(db, request, ctx, "org_profile_update", "organization",
                   resource_id=str(org.id),
                   details={"before": {f: before[f] for f in changed},
                            "after": {f: after[f] for f in changed}})
        await db.commit()
    return _org_payload(org)
