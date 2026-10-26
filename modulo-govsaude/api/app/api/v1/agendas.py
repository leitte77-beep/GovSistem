"""Agendas, horários, bloqueios e disponibilidade (B.6-001, B.6-002, B.3-008)."""

from __future__ import annotations

import uuid
from datetime import date

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
    AgendaBloqueioCreate,
    AgendaBloqueioOut,
    AgendaCreate,
    AgendaOut,
    AgendaUpdate,
    BloqueioCancelamento,
    DisponibilidadeOut,
)
from app.schemas.comuns import Pagina
from app.schemas.rede import BaixaRequest
from app.services import agendas
from app.services.auditoria import dados_do_cliente
from app.services.rede_comum import exigir_versao

router = APIRouter(prefix="/agendas", tags=["Agendas"])


@router.get("", response_model=Pagina[AgendaOut])
async def listar_agendas(
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    profissional_id: uuid.UUID | None = None,
    especialidade_id: uuid.UUID | None = None,
    tipo: str | None = None,
    ativo: bool | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.AGENDA_LER)),
    db: AsyncSession = Depends(get_db),
):
    itens, proximo, total = await agendas.listar_agendas(
        db,
        tenant_id,
        usuario,
        estabelecimento_id=estabelecimento_id,
        profissional_id=profissional_id,
        especialidade_id=especialidade_id,
        tipo=tipo,
        ativo=ativo,
        limite=limite,
        cursor=cursor,
    )
    return Pagina[AgendaOut](
        itens=[AgendaOut.model_validate(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post("", response_model=AgendaOut, status_code=201)
async def criar_agenda(
    corpo: AgendaCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await agendas.criar_agenda(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = AgendaOut.model_validate(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.get("/{agenda_id}", response_model=AgendaOut)
async def detalhar_agenda(
    agenda_id: uuid.UUID,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.AGENDA_LER)),
    db: AsyncSession = Depends(get_db),
):
    registro = await agendas.obter_agenda_com_escopo(db, tenant_id, usuario, agenda_id)
    response.headers["ETag"] = f'"{registro.versao}"'
    return AgendaOut.model_validate(registro)


@router.patch("/{agenda_id}", response_model=AgendaOut)
async def atualizar_agenda(
    agenda_id: uuid.UUID,
    corpo: AgendaUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await agendas.atualizar_agenda(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        agenda_id=agenda_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return AgendaOut.model_validate(registro)


@router.post("/{agenda_id}/baixar", response_model=AgendaOut)
async def baixar_agenda(
    agenda_id: uuid.UUID,
    corpo: BaixaRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await agendas.baixar_agenda(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        agenda_id=agenda_id,
        motivo=corpo.motivo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return AgendaOut.model_validate(registro)


@router.get("/{agenda_id}/disponibilidade", response_model=DisponibilidadeOut)
async def disponibilidade(
    agenda_id: uuid.UUID,
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.AGENDA_LER)),
    db: AsyncSession = Depends(get_db),
):
    return await agendas.disponibilidade(
        db,
        tenant_id,
        usuario,
        agenda_id,
        data_inicio=data_inicio,
        data_fim=data_fim,
    )


@router.get("/{agenda_id}/bloqueios", response_model=list[AgendaBloqueioOut])
async def listar_bloqueios(
    agenda_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.AGENDA_LER)),
    db: AsyncSession = Depends(get_db),
):
    return [
        AgendaBloqueioOut.model_validate(item)
        for item in await agendas.listar_bloqueios(db, tenant_id, usuario, agenda_id)
    ]


@router.post("/{agenda_id}/bloqueios", response_model=AgendaBloqueioOut, status_code=201)
async def criar_bloqueio(
    agenda_id: uuid.UUID,
    corpo: AgendaBloqueioCreate,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await agendas.criar_bloqueio(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        agenda_id=agenda_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return AgendaBloqueioOut.model_validate(registro)


@router.post(
    "/{agenda_id}/bloqueios/{bloqueio_id}/cancelar",
    response_model=AgendaBloqueioOut,
)
async def cancelar_bloqueio(
    agenda_id: uuid.UUID,
    bloqueio_id: uuid.UUID,
    corpo: BloqueioCancelamento,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await agendas.cancelar_bloqueio(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        agenda_id=agenda_id,
        bloqueio_id=bloqueio_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return AgendaBloqueioOut.model_validate(registro)
