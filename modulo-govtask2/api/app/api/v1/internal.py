"""Sincronização com a plataforma SaaS (provisionamento de tenant e usuário).

Protegido por X-Internal-Key. A chave tem que ser idêntica à da plataforma —
quando ela diverge, o módulo aceita o login por SSO mas não conhece o
usuário, e o erro só aparece depois, como falha de chave estrangeira.
"""

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_internal_key
from app.core.database import get_db
from app.core.permissions import ROLE_DEFAULT_PERMISSIONS
from app.models.auth_models import Organization, Role, User, UserRole
from app.services import setores as setor_service

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


# Papéis da plataforma → papéis do módulo. Qualquer nome não listado vira
# CONSULTA: ninguém ganha poder de despachar por engano de cadastro.
ROLE_MAP = {
    "PLATFORM_ADMIN": "ADMIN",
    "ADMIN": "ADMIN",
    "GOVTASK_ADMIN": "ADMIN",
    "GOVTASK_ASSESSOR": "ASSESSOR",
    "ASSESSOR": "ASSESSOR",
    "GOVTASK_PREFEITO": "PREFEITO",
    "PREFEITO": "PREFEITO",
    "GOVTASK_DEPARTAMENTO": "DEPARTAMENTO",
    "DEPARTAMENTO": "DEPARTAMENTO",
    "SECRETARIO": "DEPARTAMENTO",
    "ORG_MEMBER": "CONSULTA",
    "CONSULTA": "CONSULTA",
}


async def _garantir_papeis(db: AsyncSession) -> None:
    for nome in ROLE_DEFAULT_PERMISSIONS:
        existe = await db.scalar(select(Role).where(Role.name == nome))
        if existe is None:
            db.add(Role(name=nome, label=nome.title(), is_system=True))
    await db.flush()


@router.post("/internal/sync-organization")
async def sync_organization(
    body: SyncOrganizationRequest,
    _: None = Depends(require_internal_key),
    db: AsyncSession = Depends(get_db),
):
    org = await db.scalar(select(Organization).where(Organization.slug == body.slug))
    if org:
        org.name = body.name
        org.cnpj = body.cnpj
        org.description = body.description
        org.logo_url = body.logo_url
        org.public_url = body.public_url
        org.is_active = body.is_active
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
    await _garantir_papeis(db)
    # Toda prefeitura nasce com os setores padrão; ela edita os seus depois.
    await setor_service.garantir_setores(db, org.id)
    await db.commit()
    return {"organization_id": str(org.id), "slug": org.slug}


@router.post("/internal/sync-user")
async def sync_user(
    body: SyncUserRequest,
    _: None = Depends(require_internal_key),
    db: AsyncSession = Depends(get_db),
):
    await _garantir_papeis(db)

    user = await db.scalar(select(User).where(User.email == body.email))
    if user:
        user.name = body.name
        user.is_active = body.is_active
        if body.organization_id:
            user.organization_id = uuid.UUID(body.organization_id)
    else:
        user = User(
            id=uuid.UUID(body.user_id),
            organization_id=uuid.UUID(body.organization_id)
            if body.organization_id
            else None,
            name=body.name,
            email=body.email,
            is_active=body.is_active,
            password_hash=None,
        )
        db.add(user)
    await db.flush()

    # Os papéis da plataforma mandam: apaga e regrava, para que a remoção de
    # um papel lá chegue aqui de verdade.
    atuais = await db.execute(select(UserRole).where(UserRole.user_id == user.id))
    for ur in atuais.scalars().all():
        await db.delete(ur)
    await db.flush()

    for papel_saas in body.roles:
        nome = ROLE_MAP.get(papel_saas)
        if not nome:
            continue
        role = await db.scalar(select(Role).where(Role.name == nome))
        if role is None:
            role = Role(name=nome, label=nome.title(), is_system=True)
            db.add(role)
            await db.flush()
        db.add(UserRole(user_id=user.id, role_id=role.id))

    await db.commit()
    return {"user_id": str(user.id), "email": user.email}
