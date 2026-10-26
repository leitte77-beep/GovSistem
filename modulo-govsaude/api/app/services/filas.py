"""Recepção, fila ordenada e chamadas (B.6-005, B.6-007, B.6-008, B.6-012, B.6-045…047)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.permissoes import Permissao
from app.core.security import agora
from app.models.agenda import (
    Agendamento,
    ChamadaPainel,
    EventoFila,
    FilaAtendimento,
    NivelClassificacaoRisco,
    ProtocoloClassificacaoRisco,
)
from app.models.cidadao import Cidadao
from app.models.enums import AcaoAuditoria, SituacaoAgendamento, SituacaoFila, TipoChamada
from app.models.nucleo import Usuario
from app.models.rede import Prioridade
from app.schemas.agenda import (
    FilaCancelarRequest,
    FilaChamarRequest,
    FilaClassificacaoUpdate,
    FilaEntradaCreate,
    FilaFinalizarRequest,
)
from app.services.agenda_comum import (
    REGRA_ORDENACAO,
    abreviar_nome,
    evento_fila,
    obter_fila,
    obter_painel,
    obter_setor_da_unidade,
    ordenar_fila,
    publicar_evento,
)
from app.services.auditoria import instantaneo, registrar
from app.services.rede_comum import exigir_acesso_estabelecimento

STATUS_ATIVOS_FILA = [
    SituacaoFila.AGUARDANDO.value,
    SituacaoFila.CHAMADO.value,
    SituacaoFila.EM_TRIAGEM.value,
    SituacaoFila.AGUARDANDO_ATENDIMENTO.value,
    SituacaoFila.EM_ATENDIMENTO.value,
]
STATUS_ENCERRADOS = {
    SituacaoFila.ATENDIDO.value,
    SituacaoFila.EVADIDO.value,
    SituacaoFila.CANCELADO.value,
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


async def _classificacao(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    estabelecimento_id: uuid.UUID,
    *,
    prioridade_id: uuid.UUID | None,
    protocolo_risco_id: uuid.UUID | None,
    nivel_risco_id: uuid.UUID | None,
) -> tuple[Prioridade | None, NivelClassificacaoRisco | None, int, int, bool]:
    prioridade = None
    if prioridade_id:
        prioridade = await db.scalar(
            select(Prioridade).where(
                Prioridade.id == prioridade_id, Prioridade.tenant_id == tenant_id
            )
        )
        if prioridade is None:
            raise NotFound("Prioridade não encontrada.")
    nivel = None
    if nivel_risco_id and not protocolo_risco_id:
        raise Unprocessable(
            "Informe o protocolo junto com o nível de risco.",
            code="protocolo_obrigatorio",
        )
    if protocolo_risco_id:
        protocolo = await db.scalar(
            select(ProtocoloClassificacaoRisco).where(
                ProtocoloClassificacaoRisco.id == protocolo_risco_id,
                ProtocoloClassificacaoRisco.tenant_id == tenant_id,
            )
        )
        if protocolo is None:
            raise NotFound("Protocolo de classificação de risco não encontrado.")
        if protocolo.estabelecimento_id != estabelecimento_id:
            raise Unprocessable(
                "O protocolo de risco pertence a outra unidade.",
                code="protocolo_outra_unidade",
            )
        if nivel_risco_id:
            nivel = await db.scalar(
                select(NivelClassificacaoRisco).where(
                    NivelClassificacaoRisco.id == nivel_risco_id,
                    NivelClassificacaoRisco.tenant_id == tenant_id,
                )
            )
            if nivel is None or nivel.protocolo_id != protocolo.id:
                raise Unprocessable(
                    "O nível de risco não pertence ao protocolo informado.",
                    code="nivel_protocolo",
                )
    nivel_ordem = nivel.ordem if nivel else 999
    prioridade_ordem = prioridade.ordem if prioridade else 999
    prioridade_legal = _prioridade_legal(prioridade)
    return prioridade, nivel, nivel_ordem, prioridade_ordem, prioridade_legal


def _prioridade_legal(prioridade: Prioridade | None) -> bool:
    return bool(prioridade and prioridade.prioridade_legal)


async def entrar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    dados: FilaEntradaCreate,
    ator: Usuario,
    cliente: dict,
    agendamento: Agendamento | None = None,
) -> FilaAtendimento:
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.FILA_GERENCIAR, dados.estabelecimento_id
    )
    await obter_setor_da_unidade(
        db, tenant_id, dados.estabelecimento_id, dados.setor_id
    )
    cidadao = await _cidadao(db, tenant_id, dados.cidadao_id)
    if agendamento is None and dados.agendamento_id:
        agendamento = await db.scalar(
            select(Agendamento).where(
                Agendamento.id == dados.agendamento_id,
                Agendamento.tenant_id == tenant_id,
            )
        )
        if agendamento is None:
            raise NotFound("Agendamento não encontrado.")
    if agendamento is not None:
        if agendamento.estabelecimento_id != dados.estabelecimento_id:
            raise NotFound("Agendamento não encontrado nesta unidade.")
        if agendamento.cidadao_id != cidadao.id:
            raise Conflict(
                "O agendamento pertence a outro cidadão.",
                code="agendamento_outro_cidadao",
            )
        if agendamento.situacao in {
            SituacaoAgendamento.CANCELADO.value,
            SituacaoAgendamento.FALTOU.value,
            SituacaoAgendamento.VENCIDO.value,
            SituacaoAgendamento.REAGENDADO.value,
            SituacaoAgendamento.ATENDIDO.value,
        }:
            raise Conflict(
                "O agendamento não está mais válido para recepção.",
                code="agendamento_nao_recepcionavel",
            )
        existente = await db.scalar(
            select(FilaAtendimento).where(
                FilaAtendimento.tenant_id == tenant_id,
                FilaAtendimento.agendamento_id == agendamento.id,
                FilaAtendimento.situacao.notin_(list(STATUS_ENCERRADOS)),
            )
        )
        if existente is not None:
            return existente
    else:
        existente = await db.scalar(
            select(FilaAtendimento).where(
                FilaAtendimento.tenant_id == tenant_id,
                FilaAtendimento.cidadao_id == cidadao.id,
                FilaAtendimento.estabelecimento_id == dados.estabelecimento_id,
                FilaAtendimento.setor_id == dados.setor_id,
                FilaAtendimento.situacao.notin_(list(STATUS_ENCERRADOS)),
            )
        )
        if existente is not None:
            raise Conflict(
                "O cidadão já está em fila ativa neste setor.",
                code="fila_duplicada",
                extra={"fila_id": str(existente.id)},
            )
    prioridade_id = dados.prioridade_id or (
        agendamento.prioridade_id if agendamento else None
    )
    protocolo_risco_id = dados.protocolo_risco_id or (
        agendamento.protocolo_risco_id if agendamento else None
    )
    nivel_risco_id = dados.nivel_risco_id or (
        agendamento.nivel_risco_id if agendamento else None
    )
    prioridade, nivel, nivel_ordem, prioridade_ordem, _ = await _classificacao(
        db,
        tenant_id,
        dados.estabelecimento_id,
        prioridade_id=prioridade_id,
        protocolo_risco_id=protocolo_risco_id,
        nivel_risco_id=nivel_risco_id,
    )
    registro = FilaAtendimento(
        tenant_id=tenant_id,
        estabelecimento_id=dados.estabelecimento_id,
        setor_id=dados.setor_id,
        cidadao_id=cidadao.id,
        agendamento_id=agendamento.id if agendamento else dados.agendamento_id,
        prioridade_id=prioridade.id if prioridade else None,
        protocolo_risco_id=protocolo_risco_id,
        nivel_risco_id=nivel.id if nivel else None,
        origem=(
            "AGENDAMENTO"
            if agendamento is not None
            else dados.origem
        ),
        situacao=SituacaoFila.AGUARDANDO.value,
        entrada_em=agora(),
        nome_abreviado=abreviar_nome(cidadao.nome_social or cidadao.nome),
        nivel_ordem=nivel_ordem,
        prioridade_ordem=prioridade_ordem,
        prioridade_legal=_prioridade_legal(prioridade),
        regra_ordenacao={"passos": REGRA_ORDENACAO},
        observacoes=dados.observacoes,
        versao=1,
    )
    registro.cidadao = cidadao
    registro.agendamento = agendamento
    registro.prioridade = prioridade
    registro.nivel_risco = nivel
    db.add(registro)
    await db.flush()
    await _evento(
        db,
        tenant_id=tenant_id,
        fila=registro,
        tipo="ENTRADA",
        usuario_id=ator.id,
        dados={
            "origem": registro.origem,
            "nivel_ordem": nivel_ordem,
            "prioridade_ordem": prioridade_ordem,
        },
    )
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="fila_atendimento",
        recurso_id=registro.id,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    await publicar_evento(
        tenant_id,
        registro.estabelecimento_id,
        registro.setor_id,
        evento_fila("entrada", registro),
    )
    return registro


async def listar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    estabelecimento_id: uuid.UUID,
    setor_id: uuid.UUID,
    situacoes: list[str] | None = None,
) -> tuple[list[FilaAtendimento], list[dict]]:
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.FILA_LER, estabelecimento_id
    )
    await obter_setor_da_unidade(db, tenant_id, estabelecimento_id, setor_id)
    filtro = situacoes or STATUS_ATIVOS_FILA
    invalidos = set(filtro) - {item.value for item in SituacaoFila}
    if invalidos:
        raise Unprocessable(
            f"Situações de fila inválidas: {', '.join(sorted(invalidos))}.",
            code="situacao_fila_invalida",
        )
    itens = list(
        (
            await db.execute(
                select(FilaAtendimento).where(
                    FilaAtendimento.tenant_id == tenant_id,
                    FilaAtendimento.estabelecimento_id == estabelecimento_id,
                    FilaAtendimento.setor_id == setor_id,
                    FilaAtendimento.situacao.in_(filtro),
                )
            )
        )
        .scalars()
        .all()
    )
    return ordenar_fila(itens), REGRA_ORDENACAO


async def obter_com_escopo(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    fila_id: uuid.UUID,
    permissao: Permissao = Permissao.FILA_LER,
) -> FilaAtendimento:
    registro = await obter_fila(db, tenant_id, fila_id)
    await exigir_acesso_estabelecimento(
        db, usuario, permissao, registro.estabelecimento_id
    )
    return registro


def posicao_na_fila(itens: list[FilaAtendimento], fila_id: uuid.UUID) -> int | None:
    for indice, item in enumerate(itens, start=1):
        if item.id == fila_id:
            return indice
    return None


async def atualizar_classificacao(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    fila_id: uuid.UUID,
    dados: FilaClassificacaoUpdate,
    ator: Usuario,
    cliente: dict,
) -> FilaAtendimento:
    registro = await obter_com_escopo(
        db, tenant_id, usuario, fila_id, Permissao.FILA_GERENCIAR
    )
    if registro.situacao in STATUS_ENCERRADOS:
        raise Conflict("Fila encerrada não pode ser reclassificada.", code="fila_encerrada")
    prioridade, nivel, nivel_ordem, prioridade_ordem, _ = await _classificacao(
        db,
        tenant_id,
        registro.estabelecimento_id,
        prioridade_id=dados.prioridade_id or registro.prioridade_id,
        protocolo_risco_id=dados.protocolo_risco_id or registro.protocolo_risco_id,
        nivel_risco_id=dados.nivel_risco_id or registro.nivel_risco_id,
    )
    antes = instantaneo(registro)
    registro.prioridade_id = prioridade.id if prioridade else None
    registro.nivel_risco_id = nivel.id if nivel else None
    registro.nivel_ordem = nivel_ordem
    registro.prioridade_ordem = prioridade_ordem
    registro.prioridade_legal = _prioridade_legal(prioridade)
    if dados.protocolo_risco_id is not None:
        registro.protocolo_risco_id = dados.protocolo_risco_id
    if dados.observacoes is not None:
        registro.observacoes = dados.observacoes
    registro.versao += 1
    await _evento(
        db,
        tenant_id=tenant_id,
        fila=registro,
        tipo="CLASSIFICACAO",
        usuario_id=ator.id,
        dados={
            "nivel_ordem": nivel_ordem,
            "prioridade_ordem": prioridade_ordem,
            "prioridade_legal": registro.prioridade_legal,
        },
    )
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="fila_atendimento",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    await publicar_evento(
        tenant_id,
        registro.estabelecimento_id,
        registro.setor_id,
        evento_fila("classificacao", registro),
    )
    return registro


async def chamar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    fila_id: uuid.UUID,
    dados: FilaChamarRequest,
    ator: Usuario,
    cliente: dict,
) -> ChamadaPainel:
    registro = await obter_com_escopo(
        db, tenant_id, usuario, fila_id, Permissao.FILA_GERENCIAR
    )
    if registro.situacao in STATUS_ENCERRADOS:
        raise Conflict("Fila encerrada não pode ser chamada.", code="fila_encerrada")
    painel = None
    if dados.painel_id:
        painel = await obter_painel(db, tenant_id, dados.painel_id)
        if painel.estabelecimento_id != registro.estabelecimento_id:
            raise Unprocessable(
                "O painel pertence a outro estabelecimento.",
                code="painel_outra_unidade",
            )
        if painel.setor_id != registro.setor_id:
            raise Unprocessable(
                "O painel pertence a outro setor.",
                code="painel_outro_setor",
            )
    nome = registro.nome_abreviado
    if painel is not None and not painel.nome_abreviado:
        nome = abreviar_nome(nome)
    tipo = (
        TipoChamada.RECHAMADA.value
        if registro.chamadas > 0 and dados.tipo == TipoChamada.NORMAL.value
        else dados.tipo
    )
    texto = f"{nome}, comparecer ao {dados.destino}"
    texto_voz = f"{nome}, dirija-se ao {dados.destino}"
    agora_chamada = agora()
    chamada = ChamadaPainel(
        tenant_id=tenant_id,
        painel_id=painel.id if painel else None,
        fila_id=registro.id,
        tipo=tipo,
        destino=dados.destino,
        nome_abreviado=nome,
        texto_chamada=texto,
        texto_voz=texto_voz,
        chamado_por_id=ator.id,
        chamado_em=agora_chamada,
    )
    db.add(chamada)
    antes = instantaneo(registro)
    registro.chamadas += 1
    registro.ultima_chamada_em = agora_chamada
    if registro.chamado_em is None:
        registro.chamado_em = agora_chamada
    if registro.situacao in {
        SituacaoFila.AGUARDANDO.value,
        SituacaoFila.AGUARDANDO_ATENDIMENTO.value,
    }:
        registro.situacao = SituacaoFila.CHAMADO.value
    registro.versao += 1
    if painel is not None:
        painel.ultima_chamada_em = agora_chamada
        painel.versao += 1
    await db.flush()
    await _evento(
        db,
        tenant_id=tenant_id,
        fila=registro,
        tipo="CHAMADA",
        usuario_id=ator.id,
        dados={
            "chamada_id": str(chamada.id),
            "destino": dados.destino,
            "texto_voz": texto_voz,
            "tipo": tipo,
        },
    )
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="fila_atendimento",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    await publicar_evento(
        tenant_id,
        registro.estabelecimento_id,
        registro.setor_id,
        evento_fila(
            "chamada",
            registro,
            extra={
                "chamada_id": str(chamada.id),
                "destino": dados.destino,
                "texto_voz": texto_voz,
                "tipo": tipo,
            },
        ),
    )
    return chamada


async def _transicao(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    fila_id: uuid.UUID,
    ator: Usuario,
    cliente: dict,
    destinos: set[str],
    novo_status: str,
    tipo_evento: str,
    mensagem_erro: str,
    ajuste,
) -> FilaAtendimento:
    registro = await obter_com_escopo(
        db, tenant_id, usuario, fila_id, Permissao.FILA_GERENCIAR
    )
    if registro.situacao not in destinos:
        raise Conflict(mensagem_erro, code="transicao_fila_invalida")
    antes = instantaneo(registro)
    registro.situacao = novo_status
    ajuste(registro)
    registro.versao += 1
    await _evento(
        db,
        tenant_id=tenant_id,
        fila=registro,
        tipo=tipo_evento,
        usuario_id=ator.id,
        dados={"situacao": novo_status},
    )
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="fila_atendimento",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    await publicar_evento(
        tenant_id,
        registro.estabelecimento_id,
        registro.setor_id,
        evento_fila(tipo_evento, registro),
    )
    return registro


async def iniciar_triagem(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    fila_id: uuid.UUID,
    ator: Usuario,
    cliente: dict,
) -> FilaAtendimento:
    def ajuste(registro: FilaAtendimento) -> None:
        registro.triagem_inicio_em = agora()

    return await _transicao(
        db,
        tenant_id=tenant_id,
        usuario=usuario,
        fila_id=fila_id,
        ator=ator,
        cliente=cliente,
        destinos={
            SituacaoFila.AGUARDANDO.value,
            SituacaoFila.CHAMADO.value,
            SituacaoFila.AGUARDANDO_ATENDIMENTO.value,
        },
        novo_status=SituacaoFila.EM_TRIAGEM.value,
        tipo_evento="TRIAGEM_INICIO",
        mensagem_erro="A fila não está em situação que permita iniciar a triagem.",
        ajuste=ajuste,
    )


async def finalizar_triagem(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    fila_id: uuid.UUID,
    ator: Usuario,
    cliente: dict,
) -> FilaAtendimento:
    def ajuste(registro: FilaAtendimento) -> None:
        registro.triagem_fim_em = agora()

    return await _transicao(
        db,
        tenant_id=tenant_id,
        usuario=usuario,
        fila_id=fila_id,
        ator=ator,
        cliente=cliente,
        destinos={SituacaoFila.EM_TRIAGEM.value},
        novo_status=SituacaoFila.AGUARDANDO_ATENDIMENTO.value,
        tipo_evento="TRIAGEM_FIM",
        mensagem_erro="A triagem não foi iniciada.",
        ajuste=ajuste,
    )


async def iniciar_atendimento(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    fila_id: uuid.UUID,
    ator: Usuario,
    cliente: dict,
) -> FilaAtendimento:
    def ajuste(registro: FilaAtendimento) -> None:
        registro.atendimento_inicio_em = agora()

    registro = await _transicao(
        db,
        tenant_id=tenant_id,
        usuario=usuario,
        fila_id=fila_id,
        ator=ator,
        cliente=cliente,
        destinos={
            SituacaoFila.AGUARDANDO.value,
            SituacaoFila.CHAMADO.value,
            SituacaoFila.AGUARDANDO_ATENDIMENTO.value,
        },
        novo_status=SituacaoFila.EM_ATENDIMENTO.value,
        tipo_evento="ATENDIMENTO_INICIO",
        mensagem_erro="A fila não está em situação que permita iniciar o atendimento.",
        ajuste=ajuste,
    )
    if registro.agendamento_id:
        agendamento = await db.scalar(
            select(Agendamento).where(
                Agendamento.id == registro.agendamento_id,
                Agendamento.tenant_id == tenant_id,
            )
        )
        if agendamento is not None:
            agendamento.situacao = SituacaoAgendamento.EM_ATENDIMENTO.value
            agendamento.iniciado_em = registro.atendimento_inicio_em
            await db.commit()
    return registro


async def finalizar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    fila_id: uuid.UUID,
    dados: FilaFinalizarRequest,
    ator: Usuario,
    cliente: dict,
) -> FilaAtendimento:
    def ajuste(registro: FilaAtendimento) -> None:
        registro.atendimento_fim_em = agora()
        if dados.observacoes is not None:
            registro.observacoes = dados.observacoes

    registro = await _transicao(
        db,
        tenant_id=tenant_id,
        usuario=usuario,
        fila_id=fila_id,
        ator=ator,
        cliente=cliente,
        destinos={SituacaoFila.EM_ATENDIMENTO.value},
        novo_status=SituacaoFila.ATENDIDO.value,
        tipo_evento="ATENDIMENTO_FIM",
        mensagem_erro="O atendimento não foi iniciado.",
        ajuste=ajuste,
    )
    if registro.agendamento_id:
        agendamento = await db.scalar(
            select(Agendamento).where(
                Agendamento.id == registro.agendamento_id,
                Agendamento.tenant_id == tenant_id,
            )
        )
        if agendamento is not None:
            agendamento.situacao = SituacaoAgendamento.ATENDIDO.value
            agendamento.concluido_em = registro.atendimento_fim_em
            await db.commit()
    return registro


async def evadir(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    fila_id: uuid.UUID,
    ator: Usuario,
    cliente: dict,
) -> FilaAtendimento:
    def ajuste(registro: FilaAtendimento) -> None:
        registro.evadido_em = agora()

    registro = await _transicao(
        db,
        tenant_id=tenant_id,
        usuario=usuario,
        fila_id=fila_id,
        ator=ator,
        cliente=cliente,
        destinos=set(STATUS_ATIVOS_FILA),
        novo_status=SituacaoFila.EVADIDO.value,
        tipo_evento="EVASAO",
        mensagem_erro="A fila já está encerrada.",
        ajuste=ajuste,
    )
    if registro.agendamento_id:
        agendamento = await db.scalar(
            select(Agendamento).where(
                Agendamento.id == registro.agendamento_id,
                Agendamento.tenant_id == tenant_id,
            )
        )
        if agendamento is not None and agendamento.situacao in {
            SituacaoAgendamento.AGENDADO.value,
            SituacaoAgendamento.CONFIRMADO.value,
            SituacaoAgendamento.AGUARDANDO.value,
            SituacaoAgendamento.EM_ATENDIMENTO.value,
        }:
            agendamento.situacao = SituacaoAgendamento.FALTOU.value
            agendamento.falta_em = registro.evadido_em
            agendamento.observacoes = "Evasão registrada na fila de atendimento."
            await db.commit()
    return registro


async def cancelar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    fila_id: uuid.UUID,
    dados: FilaCancelarRequest,
    ator: Usuario,
    cliente: dict,
) -> FilaAtendimento:
    def ajuste(registro: FilaAtendimento) -> None:
        registro.observacoes = f"{registro.observacoes or ''}\nCancelamento: {dados.motivo}".strip()

    registro = await _transicao(
        db,
        tenant_id=tenant_id,
        usuario=usuario,
        fila_id=fila_id,
        ator=ator,
        cliente=cliente,
        destinos=set(STATUS_ATIVOS_FILA),
        novo_status=SituacaoFila.CANCELADO.value,
        tipo_evento="CANCELAMENTO",
        mensagem_erro="A fila já está encerrada.",
        ajuste=ajuste,
    )
    if registro.agendamento_id:
        agendamento = await db.scalar(
            select(Agendamento).where(
                Agendamento.id == registro.agendamento_id,
                Agendamento.tenant_id == tenant_id,
            )
        )
        if (
            agendamento is not None
            and agendamento.situacao == SituacaoAgendamento.AGUARDANDO.value
        ):
            agendamento.situacao = SituacaoAgendamento.AGENDADO.value
            agendamento.recepcionado_em = None
            await db.commit()
    return registro


async def eventos(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    fila_id: uuid.UUID,
) -> list[EventoFila]:
    await obter_com_escopo(db, tenant_id, usuario, fila_id)
    return list(
        (
            await db.execute(
                select(EventoFila)
                .where(
                    EventoFila.tenant_id == tenant_id,
                    EventoFila.fila_id == fila_id,
                )
                .order_by(EventoFila.created_at)
            )
        )
        .scalars()
        .all()
    )


async def _evento(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    fila: FilaAtendimento,
    tipo: str,
    usuario_id: uuid.UUID | None,
    dados: dict | None,
) -> None:
    db.add(
        EventoFila(
            tenant_id=tenant_id,
            fila_id=fila.id,
            tipo=tipo,
            dados=dados,
            usuario_id=usuario_id,
        )
    )
    await db.flush()


def regra_ordenacao() -> list[dict]:
    return REGRA_ORDENACAO


__all__ = [
    "atualizar_classificacao",
    "cancelar",
    "chamar",
    "entrar",
    "evadir",
    "eventos",
    "finalizar",
    "finalizar_triagem",
    "iniciar_atendimento",
    "iniciar_triagem",
    "listar",
    "obter_com_escopo",
    "posicao_na_fila",
    "regra_ordenacao",
]
