"""Programação de ações dos programas: previsto × realizado (B.2-005…007)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Request, Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.programa_helpers import programacao_out
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
    ProgramacaoCreate,
    ProgramacaoOut,
    ProgramacaoPerder,
    ProgramacaoRealizar,
    ProgramacaoRemarcar,
)
from app.services import programas
from app.services.auditoria import dados_do_cliente
from app.services.rede_comum import exigir_acesso_estabelecimento

router = APIRouter(
    prefix="/programacoes-programa", tags=["Programas — programação"]
)


@router.get("", response_model=Pagina[ProgramacaoOut])
async def listar_programacoes(
    programa_id: uuid.UUID | None = None,
    inscricao_id: uuid.UUID | None = None,
    cidadao_id: uuid.UUID | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    situacao: str | None = None,
    de: date | None = None,
    ate: date | None = None,
    limite: int = 50,
    cursor: str | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.PROGRAMA_LER)),
    db: AsyncSession = Depends(get_db),
):
    itens, proximo, total = await programas.listar_programacoes(
        db,
        tenant_id,
        usuario,
        programa_id=programa_id,
        inscricao_id=inscricao_id,
        cidadao_id=cidadao_id,
        estabelecimento_id=estabelecimento_id,
        situacao=situacao,
        de=de,
        ate=ate,
        limite=limite,
        cursor=cursor,
    )
    return Pagina[ProgramacaoOut](
        itens=[programacao_out(item, usuario) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post("", response_model=ProgramacaoOut, status_code=201)
async def criar_programacao(
    corpo: ProgramacaoCreate,
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
    registro = await programas.criar_programacao(
        db,
        tenant_id=tenant_id,
        dados=corpo,
        usuario=ator,
        cliente=dados_do_cliente(request),
    )
    saida = programacao_out(registro, ator)
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


@router.get("/{programacao_id}", response_model=ProgramacaoOut)
async def detalhar_programacao(
    programacao_id: uuid.UUID,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.PROGRAMA_LER)),
    db: AsyncSession = Depends(get_db),
):
    registro = await programas.obter_programacao(db, tenant_id, programacao_id)
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.PROGRAMA_LER, registro.inscricao.estabelecimento_id
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return programacao_out(registro, usuario)


@router.post("/{programacao_id}/realizar", response_model=ProgramacaoOut)
async def realizar_programacao(
    programacao_id: uuid.UUID,
    corpo: ProgramacaoRealizar,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROGRAMA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await programas.realizar_programacao(
        db,
        tenant_id=tenant_id,
        programacao_id=programacao_id,
        dados=corpo,
        usuario=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return programacao_out(registro, ator)


@router.post("/{programacao_id}/remarcar", response_model=ProgramacaoOut)
async def remarcar_programacao(
    programacao_id: uuid.UUID,
    corpo: ProgramacaoRemarcar,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROGRAMA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await programas.remarcar_programacao(
        db,
        tenant_id=tenant_id,
        programacao_id=programacao_id,
        dados=corpo,
        usuario=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return programacao_out(registro, ator)


@router.post("/{programacao_id}/perder", response_model=ProgramacaoOut)
async def perder_programacao(
    programacao_id: uuid.UUID,
    corpo: ProgramacaoPerder,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.PROGRAMA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await programas.perder_programacao(
        db,
        tenant_id=tenant_id,
        programacao_id=programacao_id,
        dados=corpo,
        usuario=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return programacao_out(registro, ator)
