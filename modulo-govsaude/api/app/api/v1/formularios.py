"""Formulários dinâmicos versionados e respostas (B.2-004, B.12-013)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.models.nucleo import Usuario
from app.schemas.formulario import (
    FormularioCreate,
    FormularioOut,
    RespostaCreate,
    RespostaOut,
)
from app.services import formularios
from app.services.auditoria import dados_do_cliente

router = APIRouter(prefix="/formularios", tags=["Formulários dinâmicos"])


@router.get("", response_model=list[FormularioOut])
async def listar_formularios(
    codigo: str | None = None,
    ativo: bool | None = None,
    somente_vigentes: bool = True,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _: Usuario = Depends(exigir(Permissao.PROGRAMA_LER)),
    db: AsyncSession = Depends(get_db),
):
    return await formularios.listar(
        db,
        tenant_id,
        codigo=codigo,
        ativo=ativo,
        somente_vigentes=somente_vigentes,
    )


@router.post("", response_model=FormularioOut, status_code=201)
async def criar_formulario(
    corpo: FormularioCreate,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROGRAMA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await formularios.criar(
        db,
        tenant_id=tenant_id,
        dados=corpo,
        usuario=ator,
        cliente=dados_do_cliente(request),
    )
    await db.commit()
    return registro


@router.get("/{codigo}/respostas", response_model=list[RespostaOut])
async def listar_respostas(
    codigo: str,
    request: Request,
    entidade: str = Query(min_length=2, max_length=60),
    entidade_id: uuid.UUID = Query(),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.PROGRAMA_LER)),
    db: AsyncSession = Depends(get_db),
):
    return await formularios.listar_respostas(
        db,
        tenant_id=tenant_id,
        codigo=codigo,
        entidade=entidade,
        entidade_id=entidade_id,
        usuario=usuario,
        cliente=dados_do_cliente(request),
    )


@router.post("/{codigo}/respostas", response_model=RespostaOut, status_code=201)
async def submeter_resposta(
    codigo: str,
    corpo: RespostaCreate,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROGRAMA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await formularios.submeter_resposta(
        db,
        tenant_id=tenant_id,
        codigo=codigo,
        dados=corpo,
        usuario=ator,
        cliente=dados_do_cliente(request),
    )
    await db.commit()
    return registro


@router.get("/{codigo}", response_model=FormularioOut)
async def detalhar_formulario(
    codigo: str,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _: Usuario = Depends(exigir(Permissao.PROGRAMA_LER)),
    db: AsyncSession = Depends(get_db),
):
    return await formularios.obter_vigente(db, tenant_id, codigo)
