"""Endpoints internos para provisionamento via plataforma SaaS (SSO).

A plataforma GovSistem chama estes endpoints (protegidos por X-Internal-Key)
imediatamente antes de emitir o token `module_access`, garantindo que o usuário
e o órgão existam no banco do módulo. O `get_current_user` resolve o usuário
pelo `sub` do token — sem este sync, o acesso via SSO retornaria 401.
"""

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_internal_key
from app.core.database import get_db
from app.core.seeds import seed_national_domains
from app.models.enums import RoleName
from app.models.organization import Organization
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole

router = APIRouter(tags=["internal"])


class SyncOrganizationRequest(BaseModel):
    organization_id: str
    name: str
    slug: str
    cnpj: str | None = None
    description: str | None = None
    logo_url: str | None = None
    public_url: str | None = None
    is_active: bool = True


class SyncUserRequest(BaseModel):
    user_id: str
    organization_id: str
    name: str
    email: str
    is_active: bool = True
    roles: list[str] = []


@router.post("/internal/sync-organization")
async def sync_organization(
    body: SyncOrganizationRequest,
    _: None = Depends(require_internal_key),
    db: AsyncSession = Depends(get_db),
):
    """Cria/atualiza (upsert) o órgão vindo da plataforma SaaS."""
    result = await db.execute(
        select(Organization).where(Organization.slug == body.slug)
    )
    org = result.scalar_one_or_none()

    if org:
        org.name = body.name
        org.cnpj = body.cnpj
        org.description = body.description
        org.logo_url = body.logo_url
        org.public_url = body.public_url
        org.is_active = body.is_active
        if org.deleted_at is not None:
            org.deleted_at = None
    else:
        org = Organization(
            id=uuid.UUID(body.organization_id),
            name=body.name,
            slug=body.slug,
            cnpj=body.cnpj,
            description=body.description,
            logo_url=body.logo_url,
            public_url=body.public_url,
            is_active=body.is_active,
        )
        db.add(org)

    await db.flush()

    # Provisiona os domínios nacionais do SUAS (tipos de serviço, formas de
    # acesso, códigos de encaminhamento e tipos de benefício) para o órgão já
    # começar utilizável. É idempotente: só insere os que ainda faltam, então
    # rodar a cada acesso via SSO também "auto-cura" órgãos criados vazios.
    await seed_national_domains(db, org.id)

    await db.commit()
    await db.refresh(org)
    return {"organization_id": str(org.id), "slug": org.slug}


@router.post("/internal/sync-user")
async def sync_user(
    body: SyncUserRequest,
    _: None = Depends(require_internal_key),
    db: AsyncSession = Depends(get_db),
):
    """Cria/atualiza (upsert) o usuário SSO vindo da plataforma SaaS.

    Usuários SSO não têm senha local (`password_hash=None`); a autenticação é
    sempre delegada à plataforma.
    """
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()

    org_uuid = uuid.UUID(body.organization_id) if body.organization_id else None

    if user:
        user.name = body.name
        user.is_active = body.is_active
        if org_uuid:
            user.organization_id = org_uuid
        if user.deleted_at is not None:
            user.deleted_at = None
    else:
        user = User(
            id=uuid.UUID(body.user_id),
            organization_id=org_uuid,
            name=body.name,
            email=body.email.lower(),
            is_active=body.is_active,
            password_hash=None,  # gerenciado por SSO, sem senha local
        )
        db.add(user)

    await db.flush()

    # Sincroniza papéis (substitui os existentes pelos mapeados do SaaS).
    mapped_roles = {
        r for r in (_map_role(name) for name in body.roles) if r is not None
    }

    existing = await db.execute(
        select(UserRole).where(UserRole.user_id == user.id)
    )
    current_role_ids = {ur.role_id: ur for ur in existing.scalars().all()}

    if mapped_roles:
        roles_result = await db.execute(
            select(Role).where(Role.name.in_(mapped_roles))
        )
        desired_roles = roles_result.scalars().all()
        desired_ids = {r.id for r in desired_roles}

        # Remove papéis que não estão mais atribuídos.
        for role_id, ur in current_role_ids.items():
            if role_id not in desired_ids:
                await db.delete(ur)

        # Adiciona os novos.
        for role in desired_roles:
            if role.id not in current_role_ids:
                db.add(UserRole(user_id=user.id, role_id=role.id))
    else:
        # Sem papel mapeado: remove todos (fail-closed → tela "sem acesso").
        for ur in current_role_ids.values():
            await db.delete(ur)

    await db.commit()
    await db.refresh(user)
    return {"user_id": str(user.id), "email": user.email}


# Papéis nativos do SUAS que podem ser concedidos diretamente por
# UserModuleGrant na plataforma (passam verbatim).
_SUAS_ROLE_NAMES = {r.value for r in RoleName}


def _map_role(saas_role: str) -> str | None:
    """Mapeia papéis da plataforma SaaS para papéis do GovSocial (SUAS).

    - Papéis nativos do SUAS (ex.: `gestor_municipal`, `tecnico_superior`),
      concedidos via UserModuleGrant, passam sem alteração.
    - Papéis de plataforma são traduzidos ou ignorados (fail-closed).
    """
    if saas_role in _SUAS_ROLE_NAMES:
        return saas_role

    mapping = {
        "PLATFORM_ADMIN": RoleName.ADMIN.value,
        "ADMIN": RoleName.ADMIN.value,
        "SUPPORT": RoleName.SUPORTE_GOVASSIST.value,
    }
    # ORG_MEMBER, ASSESSOR, GESTOR (genéricos do SaaS) → sem acesso automático;
    # o admin do órgão concede um papel SUAS específico via grant.
    return mapping.get(saas_role)
