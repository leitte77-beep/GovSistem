"""Recepção por agendamento, demanda espontânea e identificação (B.6-005, B.6-008)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.permissoes import Permissao
from app.core.security import agora
from app.integracoes.biometria.adaptador_pendente import AdaptadorBiometriaPendente
from app.models.agenda import Agendamento, FilaAtendimento
from app.models.cidadao import Cidadao
from app.models.enums import AcaoAuditoria, SituacaoAgendamento, SituacaoFila
from app.models.nucleo import Usuario
from app.schemas.agenda import (
    AlertaOut,
    CartaoCidadaoOut,
    CheckInOut,
    CheckInRequest,
    DemandaEspontaneaRequest,
    FilaEntradaCreate,
)
from app.services import agendamentos, filas
from app.services.agenda_comum import (
    decodificar_codigo,
    fuso_organizacao,
    gerar_codigo,
    obter_agenda,
    obter_agendamento,
)
from app.services.auditoria import instantaneo, registrar
from app.services.rede_comum import exigir_acesso_estabelecimento

STATUS_BLOQUEADOS_RECEPCAO = {
    SituacaoAgendamento.CANCELADO.value,
    SituacaoAgendamento.FALTOU.value,
    SituacaoAgendamento.VENCIDO.value,
    SituacaoAgendamento.REAGENDADO.value,
    SituacaoAgendamento.ATENDIDO.value,
}


async def _cidadao(db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID) -> Cidadao:
    registro = await db.scalar(
        select(Cidadao).where(Cidadao.id == cidadao_id, Cidadao.tenant_id == tenant_id)
    )
    if registro is None or registro.baixa_em is not None:
        raise NotFound("Cidadão não encontrado.")
    if registro.unificado_para_id is not None:
        raise Conflict(
            "O cidadão foi unificado a outro cadastro.",
            code="cidadao_unificado",
            extra={"cidadao_destino_id": str(registro.unificado_para_id)},
        )
    return registro


async def _posicao(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    fila: FilaAtendimento,
) -> int | None:
    itens, _ = await filas.listar(
        db,
        tenant_id,
        usuario,
        estabelecimento_id=fila.estabelecimento_id,
        setor_id=fila.setor_id,
    )
    return filas.posicao_na_fila(itens, fila.id)


async def _resposta(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    metodo: str,
    cidadao: Cidadao,
    fila: FilaAtendimento,
    agendamento: Agendamento | None,
    alertas: list[dict] | None = None,
) -> CheckInOut:
    return CheckInOut(
        metodo=metodo,
        cidadao_id=cidadao.id,
        nome_abreviado=fila.nome_abreviado,
        agendamento_id=agendamento.id if agendamento else None,
        fila_id=fila.id,
        situacao_agendamento=agendamento.situacao if agendamento else None,
        situacao_fila=fila.situacao,
        posicao=await _posicao(db, tenant_id, usuario, fila),
        alertas=[AlertaOut(**item) for item in (alertas or [])],
        alternativas_identificacao=[
            "CODIGO_BARRAS",
            "QR_CODE",
            "MANUAL",
        ],
    )


async def check_in(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    dados: CheckInRequest,
    ator: Usuario,
    cliente: dict,
) -> CheckInOut:
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.FILA_GERENCIAR, dados.estabelecimento_id
    )
    if dados.metodo == "BIOMETRIA":
        resultado = await AdaptadorBiometriaPendente().identificar(
            dados.biometria_token or "", tenant_id=tenant_id
        )
        raise Unprocessable(
            resultado.mensagem,
            code="biometria_pendente",
            extra={
                "status": resultado.status,
                "alternativas_identificacao": ["CODIGO_BARRAS", "QR_CODE", "MANUAL"],
            },
        )
    agendamento = None
    if dados.metodo in {"CODIGO_BARRAS", "QR_CODE"}:
        if not dados.codigo:
            raise Unprocessable(
                "Informe o código do cartão ou comprovante.",
                code="codigo_obrigatorio",
            )
        tipo, identificador = decodificar_codigo(dados.codigo)
        if tipo == "AGD":
            agendamento = await obter_agendamento(db, tenant_id, identificador)
        elif tipo == "CID":
            cidadao = await _cidadao(db, tenant_id, identificador)
            return await _check_in_espontaneo(
                db,
                tenant_id=tenant_id,
                usuario=usuario,
                dados=dados,
                cidadao=cidadao,
                ator=ator,
                cliente=cliente,
                metodo=dados.metodo,
            )
        if agendamento is not None:
            return await _check_in_agendamento(
                db,
                tenant_id=tenant_id,
                usuario=usuario,
                dados=dados,
                agendamento=agendamento,
                ator=ator,
                cliente=cliente,
                metodo=dados.metodo,
            )
    if dados.metodo == "MANUAL":
        if dados.agendamento_id:
            agendamento = await obter_agendamento(
                db, tenant_id, dados.agendamento_id
            )
            return await _check_in_agendamento(
                db,
                tenant_id=tenant_id,
                usuario=usuario,
                dados=dados,
                agendamento=agendamento,
                ator=ator,
                cliente=cliente,
                metodo="MANUAL",
            )
        if not dados.cidadao_id:
            raise Unprocessable(
                "Informe o cidadão ou o agendamento para a identificação manual.",
                code="cidadao_obrigatorio",
            )
        cidadao = await _cidadao(db, tenant_id, dados.cidadao_id)
        return await _check_in_espontaneo(
            db,
            tenant_id=tenant_id,
            usuario=usuario,
            dados=dados,
            cidadao=cidadao,
            ator=ator,
            cliente=cliente,
            metodo="MANUAL",
        )
    raise NotFound("Código de acesso inválido ou não encontrado.")


async def _check_in_agendamento(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    dados: CheckInRequest,
    agendamento: Agendamento,
    ator: Usuario,
    cliente: dict,
    metodo: str,
) -> CheckInOut:
    if agendamento.estabelecimento_id != dados.estabelecimento_id:
        raise NotFound("Agendamento não encontrado nesta unidade.")
    agenda = await obter_agenda(db, tenant_id, agendamento.agenda_id)
    cidadao = await _cidadao(db, tenant_id, agendamento.cidadao_id)
    fuso = await fuso_organizacao(db, tenant_id)
    inicio_local = agendamento.inicio_em
    if inicio_local.tzinfo is None:
        inicio_local = inicio_local.replace(tzinfo=timezone.utc)
    inicio_local = inicio_local.astimezone(fuso)
    alertas = agendamentos.alertas_agendamento(agenda, cidadao, inicio_local)
    if agendamento.situacao in STATUS_BLOQUEADOS_RECEPCAO:
        raise Conflict(
            "Este agendamento não pode ser recepcionado.",
            code="agendamento_bloqueado",
            extra={
                "agendamento_id": str(agendamento.id),
                "situacao": agendamento.situacao,
                "alertas": alertas,
                "pode_encaixe": bool(agenda.permite_encaixe),
            },
        )
    if inicio_local.date() != datetime.now(fuso).date():
        raise Conflict(
            "O agendamento não é para a data atual.",
            code="agendamento_fora_do_dia",
            extra={"inicio_em": inicio_local.isoformat()},
        )
    existente = await db.scalar(
        select(FilaAtendimento).where(
            FilaAtendimento.tenant_id == tenant_id,
            FilaAtendimento.agendamento_id == agendamento.id,
            FilaAtendimento.situacao.notin_(
                [
                    SituacaoFila.ATENDIDO.value,
                    SituacaoFila.EVADIDO.value,
                    SituacaoFila.CANCELADO.value,
                ]
            ),
        )
    )
    if existente is not None:
        return await _resposta(
            db,
            tenant_id,
            usuario,
            metodo=metodo,
            cidadao=cidadao,
            fila=existente,
            agendamento=agendamento,
            alertas=alertas,
        )
    setor_id = dados.setor_id or agendamento.setor_id or agenda.setor_id
    if setor_id is None:
        raise Unprocessable(
            "Informe o setor de destino da recepção.",
            code="setor_obrigatorio",
        )
    antes = instantaneo(agendamento)
    agendamento.situacao = SituacaoAgendamento.AGUARDANDO.value
    agendamento.recepcionado_em = agora()
    agendamento.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=agendamento.estabelecimento_id,
        recurso="agendamento",
        recurso_id=agendamento.id,
        dados_antes=antes,
        dados_depois=instantaneo(agendamento),
        cliente=cliente,
    )
    fila = await filas.entrar(
        db,
        tenant_id=tenant_id,
        usuario=usuario,
        dados=FilaEntradaCreate(
            estabelecimento_id=agendamento.estabelecimento_id,
            setor_id=setor_id,
            cidadao_id=cidadao.id,
            agendamento_id=agendamento.id,
            prioridade_id=dados.prioridade_id or agendamento.prioridade_id,
            protocolo_risco_id=dados.protocolo_risco_id or agendamento.protocolo_risco_id,
            nivel_risco_id=dados.nivel_risco_id or agendamento.nivel_risco_id,
            origem="AGENDAMENTO",
            observacoes=dados.observacoes,
        ),
        ator=ator,
        cliente=cliente,
        agendamento=agendamento,
    )
    return await _resposta(
        db,
        tenant_id,
        usuario,
        metodo=metodo,
        cidadao=cidadao,
        fila=fila,
        agendamento=agendamento,
        alertas=alertas,
    )


async def _check_in_espontaneo(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    dados: CheckInRequest,
    cidadao: Cidadao,
    ator: Usuario,
    cliente: dict,
    metodo: str,
) -> CheckInOut:
    if dados.setor_id is None:
        raise Unprocessable(
            "Informe o setor de destino para a demanda espontânea.",
            code="setor_obrigatorio",
        )
    fila = await filas.entrar(
        db,
        tenant_id=tenant_id,
        usuario=usuario,
        dados=FilaEntradaCreate(
            estabelecimento_id=dados.estabelecimento_id,
            setor_id=dados.setor_id,
            cidadao_id=cidadao.id,
            prioridade_id=dados.prioridade_id,
            protocolo_risco_id=dados.protocolo_risco_id,
            nivel_risco_id=dados.nivel_risco_id,
            origem="DEMANDA_ESPONTANEA",
            observacoes=dados.observacoes,
        ),
        ator=ator,
        cliente=cliente,
    )
    return await _resposta(
        db,
        tenant_id,
        usuario,
        metodo=metodo,
        cidadao=cidadao,
        fila=fila,
        agendamento=None,
    )


async def demanda_espontanea(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    dados: DemandaEspontaneaRequest,
    ator: Usuario,
    cliente: dict,
) -> FilaAtendimento:
    return await filas.entrar(
        db,
        tenant_id=tenant_id,
        usuario=usuario,
        dados=FilaEntradaCreate(
            estabelecimento_id=dados.estabelecimento_id,
            setor_id=dados.setor_id,
            cidadao_id=dados.cidadao_id,
            prioridade_id=dados.prioridade_id,
            protocolo_risco_id=dados.protocolo_risco_id,
            nivel_risco_id=dados.nivel_risco_id,
            origem=dados.origem,
            observacoes=dados.observacoes,
        ),
        ator=ator,
        cliente=cliente,
    )


async def cartao(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    cidadao_id: uuid.UUID,
    ator: Usuario,
    cliente: dict,
) -> CartaoCidadaoOut:
    cidadao = await _cidadao(db, tenant_id, cidadao_id)
    codigo = gerar_codigo("CID", cidadao.id)
    await registrar(
        db,
        acao=AcaoAuditoria.IMPRIMIR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao",
        recurso_id=cidadao.id,
        finalidade="emissão de cartão com QR/código de barras",
        cliente=cliente,
    )
    await db.commit()
    return CartaoCidadaoOut(
        cidadao_id=cidadao.id,
        codigo_acesso=codigo,
        codigo_barras=codigo,
        formato="CODE128",
        instrucoes=(
            "Apresente o código na recepção. A biometria é opcional e nunca "
            "substitui o código, o QR ou a identificação manual."
        ),
    )
