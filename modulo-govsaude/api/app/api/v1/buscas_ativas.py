"""Busca ativa de ações programáticas pendentes (B.2-012)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.programa_helpers import busca_out
from app.api.v1.rede_helpers import (
    cache_idempotencia,
    gravar_idempotencia,
    resposta_cache,
)
from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.models.nucleo import Usuario
from app.schemas.comuns import Pagina
from app.schemas.programa import (
    BuscaAtivaCreate,
    BuscaAtivaOut,
    BuscaAtivaUpdate,
    PendenciaBuscaAtivaOut,
)
from app.services import programas
from app.services.auditoria import dados_do_cliente
from app.services.rede_comum import exigir_acesso_estabelecimento, exigir_versao

router = APIRouter(prefix="/buscas-ativas", tags=["Programas — busca ativa"])


@router.get("", response_model=Pagina[BuscaAtivaOut])
async def listar_buscas(
    programa_id: uuid.UUID | None = None,
    inscricao_id: uuid.UUID | None = None,
    situacao: str | None = Query(
        default=None,
        pattern="^(PENDENTE|CONTATADO|RECUPERADO|SEM_SUCESSO|TRANSFERIDO)$",
    ),
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.PROGRAMA_BUSCA_ATIVA)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-011 — busca ativa."""
    itens, proximo, total = await programas.listar_buscas(
        db,
        tenant_id,
        usuario,
        programa_id=programa_id,
        inscricao_id=inscricao_id,
        situacao=situacao,
        limite=limite,
        cursor=cursor,
    )
    return Pagina[BuscaAtivaOut](
        itens=[busca_out(item, usuario) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.get("/pendencias", response_model=list[PendenciaBuscaAtivaOut])
async def pendencias_busca_ativa(
    programa_id: uuid.UUID | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    dias_atraso_minimo: int = Query(1, ge=0, le=3650),
    limite: int = Query(100, ge=1, le=500),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.PROGRAMA_BUSCA_ATIVA)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-011 — busca ativa."""
    return await programas.pendencias_busca_ativa(
        db,
        tenant_id,
        usuario,
        programa_id=programa_id,
        estabelecimento_id=estabelecimento_id,
        dias_atraso_minimo=dias_atraso_minimo,
        limite=limite,
    )


@router.post("", response_model=BuscaAtivaOut, status_code=201)
async def criar_busca(
    corpo: BuscaAtivaCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROGRAMA_BUSCA_ATIVA)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-011 — busca ativa."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await programas.criar_busca(
        db,
        tenant_id=tenant_id,
        dados=corpo,
        usuario=ator,
        cliente=dados_do_cliente(request),
    )
    saida = busca_out(registro, ator)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db,
        tenant_id,
        chave,
        request,
        request_hash,
        201,
        jsonable_encoder(saida),
        ator,
    )
    return saida


@router.get("/{busca_id}", response_model=BuscaAtivaOut)
async def detalhar_busca(
    busca_id: uuid.UUID,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.PROGRAMA_BUSCA_ATIVA)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-011 — busca ativa."""
    registro = await programas.obter_busca(db, tenant_id, busca_id)
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.PROGRAMA_BUSCA_ATIVA, registro.inscricao.estabelecimento_id
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return busca_out(registro, usuario)


@router.patch("/{busca_id}", response_model=BuscaAtivaOut)
async def atualizar_busca(
    busca_id: uuid.UUID,
    corpo: BuscaAtivaUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROGRAMA_BUSCA_ATIVA)),
    db: AsyncSession = Depends(get_db),
):
    """B.2-011 — busca ativa."""
    registro = await programas.atualizar_busca(
        db,
        tenant_id=tenant_id,
        busca_id=busca_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        usuario=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return busca_out(registro, ator)
