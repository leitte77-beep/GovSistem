"""Endpoints do portal do tenant (app.govsistem.com.br).

Namespace /tenant: contexto, dashboard, módulos, usuários, grants, auditoria.
Todo acesso é derivado do membership autenticado (get_tenant_context) e filtrado
no backend. Rotas de gestor exigem require_tenant_manager.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info
from app.core.config import settings
from app.core.database import get_db
from app.core.membership_deps import (
    TenantContext,
    get_tenant_context,
    require_tenant_manager,
)
from app.core.roles import MODULE_ROLE_CATALOG, is_valid_grant, normalize_grant_role
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
    """Edição de perfil do vínculo. Nome/telefone/CPF são dados globais do
    usuário; cargo/departamento são específicos do membership (não afetam
    outros tenants). E-mail não é alterado aqui (exige confirmação segura)."""
    name: Optional[str] = None
    phone: Optional[str] = None
    cpf: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None


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

    recent = (
        await db.execute(
            select(AuditEvent)
            .where(AuditEvent.organization_id == ctx.organization_id)
            .order_by(desc(AuditEvent.created_at))
            .limit(10)
        )
    ).scalars().all()

    return {
        "organization": {"name": ctx.organization.name, "slug": ctx.organization.slug},
        "counts": {
            "users_total": total,
            "users_active": active,
            "managers_active": managers,
            "modules_contracted": modules,
            "grants_total": grants_total,
            "grants_pending_review": grants_pending,
        },
        "recent_activity": [
            {
                "id": str(e.id),
                "action": e.action,
                "actor_email": e.actor_email,
                "created_at": e.created_at.isoformat() if e.created_at else None,
                "details": e.details,
            }
            for e in recent
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
                OrganizationMembership.deleted_at.is_(None),
                User.deleted_at.is_(None),
            )
            .order_by(User.name)
        )
    ).all()
    rows = []
    for m, u in mems:
        if search and search.lower() not in u.name.lower() and search.lower() not in u.email.lower():
            continue
        if is_active is not None and m.is_active != is_active:
            continue
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
    }


@router.patch("/users/{user_id}/profile")
async def update_tenant_user_profile(
    user_id: uuid.UUID,
    body: MemberProfileUpdate,
    request: Request,
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Edita o perfil de um usuário do tenant (gestor).

    Dados globais (name, phone, cpf) são preservados entre tenants e só são
    alterados quando fornecidos. Dados do vínculo (position, department) são
    específicos do membership. E-mail não é alterado nesta rota.
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
        "phone": u.phone,
        "cpf": u.cpf,
        "position": mem.position,
        "department": mem.department,
    }

    if body.name is not None:
        body.name = body.name.strip()
        if not body.name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nome não pode ser vazio")
        u.name = body.name
    if body.phone is not None:
        u.phone = body.phone.strip() or None
    if body.cpf is not None:
        u.cpf = body.cpf.strip() or None
    if body.position is not None:
        mem.position = body.position.strip() or None
    if body.department is not None:
        mem.department = body.department.strip() or None

    mem.updated_by = ctx.user.id
    after = {
        "name": u.name,
        "phone": u.phone,
        "cpf": u.cpf,
        "position": mem.position,
        "department": mem.department,
    }

    await _log(db, request, ctx, "membership_profile_update", "user", resource_id=str(user_id),
               details={"before": before, "after": after})
    await db.commit()

    return {
        "user_id": str(user_id),
        "name": u.name,
        "phone": u.phone,
        "cpf": u.cpf,
        "position": mem.position,
        "department": mem.department,
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

    # substituição do conjunto de grants do membership
    existing = await get_membership_grants(db, mem.id)
    for g in existing:
        if not g.requires_review and not g.role_name.startswith("__"):
            db.delete(g)
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
    return {"grants": body.grants, "sessions_revoked": len(revoked)}


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

    q = select(AuditEvent).where(
        AuditEvent.organization_id == ctx.organization_id,
        AuditEvent.resource_id.in_([str(user_id), str(mem.id)]),
    ).order_by(desc(AuditEvent.created_at))
    count_q = select(func.count(AuditEvent.id)).where(
        AuditEvent.organization_id == ctx.organization_id,
        AuditEvent.resource_id.in_([str(user_id), str(mem.id)]),
    )
    total = (await db.execute(count_q)).scalar() or 0
    rows = (await db.execute(q.offset((page - 1) * per_page).limit(per_page))).scalars().all()

    return {
        "data": [
            {
                "id": str(e.id),
                "action": e.action,
                "actor_email": e.actor_email,
                "resource_type": e.resource_type,
                "resource_id": e.resource_id,
                "details": e.details,
                "ip_address": e.ip_address,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in rows
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


# ---------------------------------------------------------------------------
# Auditoria do tenant (gestor)
# ---------------------------------------------------------------------------
@router.get("/audit")
async def tenant_audit(
    action: str | None = Query(None),
    q: str | None = Query(None),
    module: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    conditions = [AuditEvent.organization_id == ctx.organization_id]
    if action:
        conditions.append(AuditEvent.action == action)
    if module:
        conditions.append(AuditEvent.details["module"].as_string() == module)
    q_filter = None
    if q:
        like = f"%{q.lower()}%"
        q_filter = func.lower(AuditEvent.actor_email).like(like) | func.lower(AuditEvent.action).like(like)

    base = select(AuditEvent).where(*conditions)
    if q_filter is not None:
        base = base.where(q_filter)

    count_q = select(func.count(AuditEvent.id)).where(*conditions)
    if q_filter is not None:
        count_q = count_q.where(q_filter)

    total = (await db.execute(count_q)).scalar() or 0
    rows = (await db.execute(base.order_by(desc(AuditEvent.created_at)).offset((page - 1) * per_page).limit(per_page))).scalars().all()
    return {
        "data": [
            {
                "id": str(e.id),
                "action": e.action,
                "actor_email": e.actor_email,
                "resource_type": e.resource_type,
                "resource_id": e.resource_id,
                "details": e.details,
                "ip_address": e.ip_address,
                "user_agent": e.user_agent,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in rows
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


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

    # grants ativos por módulo (neste tenant)
    grant_rows = (
        await db.execute(
            select(MembershipModuleGrant.module_slug, MembershipModuleGrant.role_name)
            .where(
                MembershipModuleGrant.membership_id.in_(list(mem_ids)),
                MembershipModuleGrant.deleted_at.is_(None),
                MembershipModuleGrant.is_active.is_(True),
            )
        )
    ).all()

    per_module: dict[str, list[str]] = {}
    for slug, role in grant_rows:
        per_module.setdefault(slug, []).append(role)

    result = []
    for mod in rows:
        roles_in_use = sorted(set(per_module.get(mod.slug, [])))
        users_with_grant = len(per_module.get(mod.slug, []))
        pending = await is_flag(db, "MEMBERSHIP_GRANTS_V2_ENABLED")
        pending_count = 0
        if pending:
            pending_count = (
                await db.execute(
                    select(func.count(MembershipModuleGrant.id)).where(
                        MembershipModuleGrant.module_slug == mod.slug,
                        MembershipModuleGrant.membership_id.in_(list(mem_ids)),
                        MembershipModuleGrant.deleted_at.is_(None),
                        MembershipModuleGrant.requires_review.is_(True),
                    )
                )
            ).scalar() or 0
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
                "users_with_grant": users_with_grant,
                "roles_in_use": roles_in_use,
                "pending_review": pending_count,
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

    result = []
    for mem, u in mems:
        grants = await get_membership_grants(db, mem.id, module_slug)
        roles = [g.role_name for g in grants if g.role_name and not g.role_name.startswith("__")]
        result.append(
            {
                "user_id": str(u.id),
                "membership_id": str(mem.id),
                "name": u.name,
                "email": u.email,
                "membership_active": mem.is_active,
                "roles": sorted(set(roles)),
                "requires_review": any(g.requires_review for g in grants),
            }
        )
    return {"module_slug": module_slug, "users": result}


@router.get("/org")
async def tenant_org_info(
    ctx: TenantContext = Depends(require_tenant_manager),
    db: AsyncSession = Depends(get_db),
):
    """Dados do órgão (gestor) — página 'Dados do órgão'."""
    org = ctx.organization
    return {
        "organization_id": str(org.id),
        "slug": org.slug,
        "name": org.name,
        "cnpj": getattr(org, "cnpj", None),
        "is_active": org.is_active,
        "created_at": org.created_at.isoformat() if org.created_at else None,
        "plan": None,
    }
