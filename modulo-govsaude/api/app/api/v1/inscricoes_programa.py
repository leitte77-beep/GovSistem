"""Inscrições em programas e linhas de cuidado (B.2-002, B.2-003)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.programa_helpers import inscricao_out
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
    GerarProgramacoes,
    GerarProgramacoesOut,
    InscricaoCreate,
    InscricaoEncerrar,
    InscricaoOut,
    InscricaoUpdate,
)
from app.services import programas
from app.services.auditoria import dados_do_cliente
from app.services.rede_comum import exigir_acesso_estabelecimento, exigir_versao

router = APIRouter(
    prefix="/inscricoes-programa", tags=["Programas — inscrições"]
)


@router.get("", response_model=Pagina[InscricaoOut])
async def listar_inscricoes(
    programa_id: uuid.UUID | None = None,
    cidadao_id: uuid.UUID | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    situacao: str | None = Query(
        default=None, pattern="^(ATIVA|SUSPENSA|ENCERRADA|TRANSFERIDA)$"
    ),
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.PROGRAMA_LER)),
    db: AsyncSession = Depends(get_db),
):
    itens, proximo, total = await programas.listar_inscricoes(
        db,
        tenant_id,
        usuario,
        programa_id=programa_id,
        cidadao_id=cidadao_id,
        estabelecimento_id=estabelecimento_id,
        situacao=situacao,
        limite=limite,
        cursor=cursor,
    )
    return Pagina[InscricaoOut](
        itens=[inscricao_out(item, usuario) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post("", response_model=InscricaoOut, status_code=201)
async def criar_inscricao(
    corpo: InscricaoCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROGRAMA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await programas.criar_inscricao(
        db,
        tenant_id=tenant_id,
        dados=corpo,
        usuario=ator,
        cliente=dados_do_cliente(request),
    )
    saida = inscricao_out(registro, ator)
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


@router.get("/{inscricao_id}", response_model=InscricaoOut)
async def detalhar_inscricao(
    inscricao_id: uuid.UUID,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.PROGRAMA_LER)),
    db: AsyncSession = Depends(get_db),
):
    registro = await programas.obter_inscricao(db, tenant_id, inscricao_id)
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.PROGRAMA_LER, registro.estabelecimento_id
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return inscricao_out(registro, usuario)


@router.patch("/{inscricao_id}", response_model=InscricaoOut)
async def atualizar_inscricao(
    inscricao_id: uuid.UUID,
    corpo: InscricaoUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROGRAMA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await programas.atualizar_inscricao(
        db,
        tenant_id=tenant_id,
        inscricao_id=inscricao_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        usuario=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return inscricao_out(registro, ator)


@router.post("/{inscricao_id}/encerrar", response_model=InscricaoOut)
async def encerrar_inscricao(
    inscricao_id: uuid.UUID,
    corpo: InscricaoEncerrar,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROGRAMA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await programas.encerrar_inscricao(
        db,
        tenant_id=tenant_id,
        inscricao_id=inscricao_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        usuario=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return inscricao_out(registro, ator)


@router.post(
    "/{inscricao_id}/gerar-programacoes",
    response_model=GerarProgramacoesOut,
)
async def gerar_programacoes(
    inscricao_id: uuid.UUID,
    corpo: GerarProgramacoes,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROGRAMA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    return await programas.gerar_programacoes_inscricao(
        db,
        tenant_id=tenant_id,
        inscricao_id=inscricao_id,
        dados=corpo,
        usuario=ator,
        cliente=dados_do_cliente(request),
    )
