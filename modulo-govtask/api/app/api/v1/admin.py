import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models.setor import Setor
from app.models.template_fluxo import TemplateEtapa, TemplateFluxo
from app.models.user import User
from app.schemas.template_fluxo import (
    TemplateEtapaOut,
    TemplateFluxoCreate,
    TemplateFluxoOut,
)

router = APIRouter(tags=["admin"])


# ── Setores ───────────────────────────────────────────────

class SetorCreate(BaseModel):
    nome: str
    sigla: str | None = None
    descricao: str | None = None


class SetorOut(BaseModel):
    id: uuid.UUID
    nome: str
    sigla: str | None
    descricao: str | None
    ativo: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/admin/setores", response_model=list[SetorOut])
async def listar_setores(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Setor).where(Setor.deleted_at.is_(None)).order_by(Setor.nome)
    )
    return result.scalars().all()


@router.post("/admin/setores", response_model=SetorOut, status_code=201)
async def criar_setor(
    body: SetorCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN")),
):
    setor = Setor(
        nome=body.nome,
        sigla=body.sigla,
        descricao=body.descricao,
    )
    db.add(setor)
    await db.commit()
    await db.refresh(setor)
    return setor


# ── Templates de Fluxo ────────────────────────────────────

@router.get("/admin/templates-fluxo", response_model=list[TemplateFluxoOut])
async def listar_templates_fluxo(
    tipo_convenio: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = (
        select(TemplateFluxo)
        .where(TemplateFluxo.deleted_at.is_(None))
        .options(selectinload(TemplateFluxo.etapas))
        .order_by(TemplateFluxo.nome)
    )
    if tipo_convenio:
        query = query.where(TemplateFluxo.tipo_convenio == tipo_convenio)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/admin/templates-fluxo", response_model=TemplateFluxoOut, status_code=201)
async def criar_template_fluxo(
    body: TemplateFluxoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN")),
):
    template = TemplateFluxo(
        nome=body.nome,
        tipo_convenio=body.tipo_convenio,
        descricao=body.descricao,
    )
    db.add(template)
    await db.flush()

    for etapa_data in body.etapas:
        etapa = TemplateEtapa(
            template_fluxo_id=template.id,
            nome=etapa_data.nome,
            ordem=etapa_data.ordem,
            natureza=etapa_data.natureza,
        )
        db.add(etapa)

    await db.commit()
    await db.refresh(template)
    return template


@router.patch("/admin/templates-fluxo/{template_id}", response_model=TemplateFluxoOut)
async def atualizar_template_fluxo(
    template_id: uuid.UUID,
    body: TemplateFluxoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN")),
):
    result = await db.execute(
        select(TemplateFluxo)
        .where(TemplateFluxo.id == template_id, TemplateFluxo.deleted_at.is_(None))
        .options(selectinload(TemplateFluxo.etapas))
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado")

    template.nome = body.nome
    template.tipo_convenio = body.tipo_convenio
    template.descricao = body.descricao

    # Remove etapas antigas e recria
    for etapa in template.etapas:
        await db.delete(etapa)
    await db.flush()

    for etapa_data in body.etapas:
        etapa = TemplateEtapa(
            template_fluxo_id=template.id,
            nome=etapa_data.nome,
            ordem=etapa_data.ordem,
            natureza=etapa_data.natureza,
        )
        db.add(etapa)

    await db.commit()
    await db.refresh(template)
    return template


class UserListItem(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    is_active: bool
    model_config = {"from_attributes": True}


@router.get("/admin/users", response_model=list[UserListItem])
async def listar_usuarios(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(User).where(User.deleted_at.is_(None), User.is_active == True).order_by(User.name)
    )
    return result.scalars().all()
