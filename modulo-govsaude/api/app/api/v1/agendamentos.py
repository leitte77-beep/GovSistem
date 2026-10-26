"""Agendamentos, confirmação, cancelamento, reagendamento e falta (Fase 4)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.agenda_helpers import agendamento_out
from app.api.v1.rede_helpers import (
    cache_idempotencia,
    gravar_idempotencia,
    resposta_cache,
)
from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.models.enums import AcaoAuditoria
from app.models.nucleo import Usuario
from app.schemas.agenda import (
    AgendamentoCancelar,
    AgendamentoComprovanteOut,
    AgendamentoCreate,
    AgendamentoFalta,
    AgendamentoOut,
    AgendamentoReagendar,
    AgendamentoReverterFalta,
    AgendamentoUpdate,
)
from app.schemas.comuns import Pagina
from app.services import agendamentos
from app.services.auditoria import dados_do_cliente, registrar
from app.services.rede_comum import exigir_versao

router = APIRouter(prefix="/agendamentos", tags=["Agendamentos"])


async def _auditar_leitura(
    db: AsyncSession,
    request: Request,
    usuario: Usuario,
    *,
    recurso_id: uuid.UUID | None = None,
) -> None:
    await registrar(
        db,
        acao=AcaoAuditoria.READ_SENSIVEL,
        usuario=usuario,
        recurso="agendamento",
        recurso_id=recurso_id,
        finalidade="operação de agenda e recepção",
        cliente=dados_do_cliente(request),
    )
    await db.commit()


@router.get("", response_model=Pagina[AgendamentoOut])
async def listar_agendamentos(
    request: Request,
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    agenda_id: uuid.UUID | None = None,
    profissional_id: uuid.UUID | None = None,
    cidadao_id: uuid.UUID | None = None,
    situacao: str | None = None,
    data_inicio: date | None = None,
    data_fim: date | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.AGENDA_LER)),
    db: AsyncSession = Depends(get_db),
):
    itens, proximo, total = await agendamentos.listar(
        db,
        tenant_id,
        usuario,
        estabelecimento_id=estabelecimento_id,
        agenda_id=agenda_id,
        profissional_id=profissional_id,
        cidadao_id=cidadao_id,
        situacao=situacao,
        data_inicio=data_inicio,
        data_fim=data_fim,
        limite=limite,
        cursor=cursor,
    )
    await _auditar_leitura(db, request, usuario)
    return Pagina[AgendamentoOut](
        itens=[agendamento_out(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post("", response_model=AgendamentoOut, status_code=201)
async def criar_agendamento(
    corpo: AgendamentoCreate,
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
    registro, codigo, alertas = await agendamentos.criar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = agendamento_out(registro, codigo_acesso=codigo, alertas=alertas)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.get("/{agendamento_id}", response_model=AgendamentoOut)
async def detalhar_agendamento(
    agendamento_id: uuid.UUID,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.AGENDA_LER)),
    db: AsyncSession = Depends(get_db),
):
    registro = await agendamentos.obter_com_escopo(
        db, tenant_id, usuario, agendamento_id
    )
    await _auditar_leitura(db, request, usuario, recurso_id=registro.id)
    response.headers["ETag"] = f'"{registro.versao}"'
    return agendamento_out(registro)


@router.patch("/{agendamento_id}", response_model=AgendamentoOut)
async def atualizar_agendamento(
    agendamento_id: uuid.UUID,
    corpo: AgendamentoUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await agendamentos.atualizar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        agendamento_id=agendamento_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return agendamento_out(registro)


@router.post("/{agendamento_id}/confirmar", response_model=AgendamentoOut)
async def confirmar_agendamento(
    agendamento_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await agendamentos.confirmar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        agendamento_id=agendamento_id,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return agendamento_out(registro)


@router.post("/{agendamento_id}/cancelar", response_model=AgendamentoOut)
async def cancelar_agendamento(
    agendamento_id: uuid.UUID,
    corpo: AgendamentoCancelar,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await agendamentos.cancelar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        agendamento_id=agendamento_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return agendamento_out(registro)


@router.post("/{agendamento_id}/reagendar", response_model=AgendamentoOut)
async def reagendar_agendamento(
    agendamento_id: uuid.UUID,
    corpo: AgendamentoReagendar,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro, codigo, alertas = await agendamentos.reagendar(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        agendamento_id=agendamento_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return agendamento_out(registro, codigo_acesso=codigo, alertas=alertas)


@router.post("/{agendamento_id}/falta", response_model=AgendamentoOut)
async def marcar_falta(
    agendamento_id: uuid.UUID,
    corpo: AgendamentoFalta,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await agendamentos.marcar_falta(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        agendamento_id=agendamento_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return agendamento_out(registro)


@router.post("/{agendamento_id}/reverter-falta", response_model=AgendamentoOut)
async def reverter_falta(
    agendamento_id: uuid.UUID,
    corpo: AgendamentoReverterFalta,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    registro = await agendamentos.reverter_falta(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        agendamento_id=agendamento_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return agendamento_out(registro)


@router.post("/{agendamento_id}/comprovante", response_model=AgendamentoComprovanteOut)
async def emitir_comprovante(
    agendamento_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.AGENDA_LER)),
    db: AsyncSession = Depends(get_db),
):
    registro, codigo = await agendamentos.gerar_comprovante(
        db,
        tenant_id=tenant_id,
        usuario=ator,
        agendamento_id=agendamento_id,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return AgendamentoComprovanteOut(
        agendamento_id=registro.id,
        codigo_acesso=codigo,
        codigo_barras=codigo,
        texto=(
            "Apresente este código na recepção da unidade na data do agendamento. "
            "O código identifica apenas o agendamento e não contém CPF, CNS ou nome."
        ),
    )
