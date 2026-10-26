"""Painéis eletrônicos de chamada e notícias (B.6-045, B.6-046, B.6-047)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.schemas.agenda import (
    PainelChamadaCreate,
    PainelChamadaOut,
    PainelChamadaUpdate,
    PainelEstadoOut,
)
from app.schemas.comuns import Pagina
from app.services import paineis
from app.services.auditoria import dados_do_cliente
from app.services.rede_comum import exigir_versao

router = APIRouter(prefix="/paineis-chamada", tags=["Painéis de chamada"])


@router.get("", response_model=Pagina[PainelChamadaOut])
async def listar_paineis(
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    setor_id: uuid.UUID | None = None,
    ativo: bool | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.FILA_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-045, B.6-046 — painel de chamada."""
    itens, proximo, total = await paineis.listar(
        db,
        tenant_id,
        usuario,
        estabelecimento_id=estabelecimento_id,
        setor_id=setor_id,
        ativo=ativo,
        limite=limite,
        cursor=cursor,
    )
    return Pagina[PainelChamadaOut](
        itens=[PainelChamadaOut.model_validate(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post("", response_model=PainelChamadaOut, status_code=201)
async def criar_painel(
    corpo: PainelChamadaCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.FILA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-045, B.6-046 — painel de chamada."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await paineis.criar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = PainelChamadaOut.model_validate(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.get("/{painel_id}", response_model=PainelChamadaOut)
async def detalhar_painel(
    painel_id: uuid.UUID,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.FILA_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-045, B.6-046 — painel de chamada."""
    registro = await paineis.obter(db, tenant_id, usuario, painel_id)
    response.headers["ETag"] = f'"{registro.versao}"'
    return PainelChamadaOut.model_validate(registro)


@router.patch("/{painel_id}", response_model=PainelChamadaOut)
async def atualizar_painel(
    painel_id: uuid.UUID,
    corpo: PainelChamadaUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.FILA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-045, B.6-046 — painel de chamada."""
    registro = await paineis.atualizar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        painel_id=painel_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return PainelChamadaOut.model_validate(registro)


@router.get("/{painel_id}/estado", response_model=PainelEstadoOut)
async def estado_painel(
    painel_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.FILA_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-045, B.6-046 — painel de chamada."""
    return await paineis.estado(db, tenant_id, usuario, painel_id)
