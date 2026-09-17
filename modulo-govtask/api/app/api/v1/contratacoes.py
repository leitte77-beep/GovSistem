"""Visão consolidada de licitações e contratos do tenant.

Existe para a área de trabalho de Compras & Licitações: sem ela, a tela
precisaria varrer processo a processo para montar a mesma lista.
"""

import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.contrato import Contrato
from app.models.convenio import Convenio
from app.models.licitacao import Licitacao
from app.models.user import User
from app.schemas.contrato import ContratoOut
from app.schemas.licitacao import LicitacaoOut

router = APIRouter(tags=["contratacoes"])


class LicitacaoComProcesso(LicitacaoOut):
    processo_titulo: str | None = None


class ContratoComProcesso(ContratoOut):
    processo_titulo: str | None = None


@router.get("/licitacoes", response_model=list[LicitacaoComProcesso])
async def listar_licitacoes_do_tenant(
    situacao: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.LICITACAO_MANAGE, Perm.RESOURCE_VIEW)),
):
    query = (
        select(Licitacao, Convenio.titulo)
        .join(Convenio, Licitacao.convenio_id == Convenio.id)
        .where(
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
            Licitacao.deleted_at.is_(None),
        )
    )
    if situacao:
        query = query.where(Licitacao.situacao == situacao)
    query = query.order_by(Licitacao.updated_at.desc()).offset(skip).limit(limit)

    linhas = (await db.execute(query)).all()
    return [
        LicitacaoComProcesso(
            **LicitacaoOut.model_validate(lic).model_dump(), processo_titulo=titulo
        )
        for lic, titulo in linhas
    ]


@router.get("/contratos", response_model=list[ContratoComProcesso])
async def listar_contratos_do_tenant(
    status: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.LICITACAO_MANAGE, Perm.RESOURCE_VIEW)),
):
    query = (
        select(Contrato, Convenio.titulo)
        .join(Convenio, Contrato.convenio_id == Convenio.id)
        .options(selectinload(Contrato.aditivos))
        .where(
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
            Contrato.deleted_at.is_(None),
        )
    )
    if status:
        query = query.where(Contrato.status == status)
    query = query.order_by(Contrato.updated_at.desc()).offset(skip).limit(limit)

    linhas = (await db.execute(query)).all()
    return [
        ContratoComProcesso(
            **ContratoOut.model_validate(c).model_dump(), processo_titulo=titulo
        )
        for c, titulo in linhas
    ]
