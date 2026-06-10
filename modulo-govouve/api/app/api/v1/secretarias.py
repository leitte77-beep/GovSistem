"""Secretaria CRUD endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models.user import User
from app.models.secretaria import Secretaria

router = APIRouter(prefix="/secretarias", tags=["secretarias"])


class SecretariaCreate(BaseModel):
    nome: str
    slug: str
    cnpj: str | None = None
    descricao: str | None = None
    ouvidor_responsavel: str | None = None
    config: dict | None = None


class SecretariaUpdate(BaseModel):
    nome: str | None = None
    slug: str | None = None
    cnpj: str | None = None
    descricao: str | None = None
    ativo: bool | None = None
    ouvidor_responsavel: str | None = None
    config: dict | None = None


class SecretariaOut(BaseModel):
    id: str
    tenant_id: str
    nome: str
    slug: str
    cnpj: str | None
    descricao: str | None
    ativo: bool
    ouvidor_responsavel: str | None
    config: dict | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


@router.get("", response_model=list[SecretariaOut])
async def list_secretarias(
    user: User = Depends(require_roles("ADMIN", "OUVIDOR_GERAL", "GESTOR_SECRETARIA", "ATENDENTE")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Secretaria)
        .where(
            Secretaria.tenant_id == user.organization_id,
            Secretaria.deleted_at.is_(None),
        )
        .order_by(Secretaria.nome)
    )
    secretarias = result.scalars().all()
    return [
        {
            "id": str(s.id),
            "tenant_id": str(s.tenant_id),
            "nome": s.nome,
            "slug": s.slug,
            "cnpj": s.cnpj,
            "descricao": s.descricao,
            "ativo": s.ativo,
            "ouvidor_responsavel": s.ouvidor_responsavel,
            "config": s.config,
            "created_at": s.created_at.isoformat() if s.created_at else "",
            "updated_at": s.updated_at.isoformat() if s.updated_at else "",
        }
        for s in secretarias
    ]


@router.post("", response_model=SecretariaOut, status_code=201)
async def create_secretaria(
    body: SecretariaCreate,
    user: User = Depends(require_roles("ADMIN", "OUVIDOR_GERAL")),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(Secretaria).where(
            Secretaria.tenant_id == user.organization_id,
            Secretaria.slug == body.slug,
            Secretaria.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Já existe uma secretaria com este slug")

    s = Secretaria(
        tenant_id=user.organization_id,
        nome=body.nome,
        slug=body.slug,
        cnpj=body.cnpj,
        descricao=body.descricao,
        ouvidor_responsavel=body.ouvidor_responsavel,
        config=body.config,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)

    return {
        "id": str(s.id),
        "tenant_id": str(s.tenant_id),
        "nome": s.nome,
        "slug": s.slug,
        "cnpj": s.cnpj,
        "descricao": s.descricao,
        "ativo": s.ativo,
        "ouvidor_responsavel": s.ouvidor_responsavel,
        "config": s.config,
        "created_at": s.created_at.isoformat() if s.created_at else "",
        "updated_at": s.updated_at.isoformat() if s.updated_at else "",
    }


@router.get("/{secretaria_id}", response_model=SecretariaOut)
async def get_secretaria(
    secretaria_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Secretaria).where(
            Secretaria.id == uuid.UUID(secretaria_id),
            Secretaria.tenant_id == user.organization_id,
            Secretaria.deleted_at.is_(None),
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Secretaria não encontrada")

    return {
        "id": str(s.id),
        "tenant_id": str(s.tenant_id),
        "nome": s.nome,
        "slug": s.slug,
        "cnpj": s.cnpj,
        "descricao": s.descricao,
        "ativo": s.ativo,
        "ouvidor_responsavel": s.ouvidor_responsavel,
        "config": s.config,
        "created_at": s.created_at.isoformat() if s.created_at else "",
        "updated_at": s.updated_at.isoformat() if s.updated_at else "",
    }


@router.patch("/{secretaria_id}", response_model=SecretariaOut)
async def update_secretaria(
    secretaria_id: str,
    body: SecretariaUpdate,
    user: User = Depends(require_roles("ADMIN", "OUVIDOR_GERAL")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Secretaria).where(
            Secretaria.id == uuid.UUID(secretaria_id),
            Secretaria.tenant_id == user.organization_id,
            Secretaria.deleted_at.is_(None),
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Secretaria não encontrada")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(s, field, value)

    await db.commit()
    await db.refresh(s)

    return {
        "id": str(s.id),
        "tenant_id": str(s.tenant_id),
        "nome": s.nome,
        "slug": s.slug,
        "cnpj": s.cnpj,
        "descricao": s.descricao,
        "ativo": s.ativo,
        "ouvidor_responsavel": s.ouvidor_responsavel,
        "config": s.config,
        "created_at": s.created_at.isoformat() if s.created_at else "",
        "updated_at": s.updated_at.isoformat() if s.updated_at else "",
    }


@router.delete("/{secretaria_id}")
async def delete_secretaria(
    secretaria_id: str,
    user: User = Depends(require_roles("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Secretaria).where(
            Secretaria.id == uuid.UUID(secretaria_id),
            Secretaria.tenant_id == user.organization_id,
            Secretaria.deleted_at.is_(None),
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Secretaria não encontrada")

    from datetime import datetime, timezone
    s.deleted_at = datetime.now(timezone.utc)
    await db.commit()

    return {"ok": True}
