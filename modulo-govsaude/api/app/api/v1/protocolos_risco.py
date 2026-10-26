"""Protocolos de classificação de risco por unidade (B.6-007, B.3-003)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, Query, Request
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
from app.schemas.agenda import ProtocoloRiscoCreate, ProtocoloRiscoOut, ProtocoloRiscoUpdate
from app.schemas.comuns import Pagina
from app.services import agendas
from app.services.auditoria import dados_do_cliente
from app.services.rede_comum import exigir_versao

router = APIRouter(
    prefix="/protocolos-classificacao-risco", tags=["Classificação de risco"]
)


@router.get("", response_model=Pagina[ProtocoloRiscoOut])
async def listar_protocolos(
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    ativo: bool | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.FILA_LER)),
    db: AsyncSession = Depends(get_db),
):
    itens, proximo, total = await agendas.listar_protocolos(
        db,
        tenant_id,
        usuario,
        estabelecimento_id=estabelecimento_id,
        ativo=ativo,
        limite=limite,
        cursor=cursor,
    )
    return Pagina[ProtocoloRiscoOut](
        itens=[ProtocoloRiscoOut.model_validate(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post("", response_model=ProtocoloRiscoOut, status_code=201)
async def criar_protocolo(
    corpo: ProtocoloRiscoCreate,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.FILA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await agendas.criar_protocolo(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = ProtocoloRiscoOut.model_validate(registro)
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201, saida.model_dump(mode="json"), ator
    )
    return saida


@router.get("/{protocolo_id}", response_model=ProtocoloRiscoOut)
async def detalhar_protocolo(
    protocolo_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.FILA_LER)),
    db: AsyncSession = Depends(get_db),
):
    from app.services.agenda_comum import obter_protocolo
    from app.services.rede_comum import exigir_acesso_estabelecimento

    registro = await obter_protocolo(db, tenant_id, protocolo_id)
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.FILA_LER, registro.estabelecimento_id
    )
    return ProtocoloRiscoOut.model_validate(registro)


@router.patch("/{protocolo_id}", response_model=ProtocoloRiscoOut)
async def atualizar_protocolo(
    protocolo_id: uuid.UUID,
    corpo: ProtocoloRiscoUpdate,
    request: Request,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.FILA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await agendas.atualizar_protocolo(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        protocolo_id=protocolo_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return ProtocoloRiscoOut.model_validate(registro)
