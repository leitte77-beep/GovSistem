"""Testes de unidade das máquinas de estado (regras de transição)."""

import pytest

from app.models.enums import (
    StatusConvenio,
    StatusContestacao,
    StatusDiligencia,
    StatusEtapa,
    StatusPrestacao,
    StatusTarefa,
)


# ── Convênio ──────────────────────────────────────────────

def test_convenio_transicoes_validas():
    assert StatusConvenio.RASCUNHO.can_transition_to(StatusConvenio.EM_ANDAMENTO)
    assert StatusConvenio.RASCUNHO.can_transition_to(StatusConvenio.CANCELADO)
    assert StatusConvenio.EM_ANDAMENTO.can_transition_to(StatusConvenio.SUSPENSO)
    assert StatusConvenio.EM_ANDAMENTO.can_transition_to(StatusConvenio.CONCLUIDO)
    assert StatusConvenio.SUSPENSO.can_transition_to(StatusConvenio.EM_ANDAMENTO)


def test_convenio_transicao_invalida_levanta():
    with pytest.raises(ValueError):
        StatusConvenio.CONCLUIDO.assert_transition(StatusConvenio.EM_ANDAMENTO)
    with pytest.raises(ValueError):
        StatusConvenio.CANCELADO.assert_transition(StatusConvenio.CONCLUIDO)


# ── Etapa ─────────────────────────────────────────────────

def test_etapa_transicoes_validas():
    assert StatusEtapa.PENDENTE.can_transition_to(StatusEtapa.EM_ANDAMENTO)
    assert StatusEtapa.EM_ANDAMENTO.can_transition_to(StatusEtapa.AGUARDANDO_GOVERNO)
    assert StatusEtapa.AGUARDANDO_GOVERNO.can_transition_to(StatusEtapa.EM_ANDAMENTO)
    assert StatusEtapa.BLOQUEADA.can_transition_to(StatusEtapa.PENDENTE)


def test_etapa_concluida_nao_reabre():
    assert not StatusEtapa.CONCLUIDA.can_transition_to(StatusEtapa.EM_ANDAMENTO)
    with pytest.raises(ValueError):
        StatusEtapa.CONCLUIDA.assert_transition(StatusEtapa.EM_ANDAMENTO)


# ── Tarefa ────────────────────────────────────────────────

def test_tarefa_ciclo_completo():
    assert StatusTarefa.AGUARDANDO_ACEITE.can_transition_to(StatusTarefa.EM_ANDAMENTO)
    assert StatusTarefa.EM_ANDAMENTO.can_transition_to(StatusTarefa.ENTREGUE)
    assert StatusTarefa.ENTREGUE.can_transition_to(StatusTarefa.DEVOLVIDA)
    assert StatusTarefa.DEVOLVIDA.can_transition_to(StatusTarefa.EM_ANDAMENTO)
    assert StatusTarefa.ENTREGUE.can_transition_to(StatusTarefa.CONCLUIDA)


def test_tarefa_concluida_termina():
    assert not StatusTarefa.CONCLUIDA.can_transition_to(StatusTarefa.EM_ANDAMENTO)
    assert not StatusTarefa.CANCELADA.can_transition_to(StatusTarefa.ENTREGUE)


def test_tarefa_is_aberta():
    assert StatusTarefa.is_aberta(StatusTarefa.EM_ANDAMENTO)
    assert StatusTarefa.is_aberta(StatusTarefa.AGUARDANDO_ACEITE)
    assert not StatusTarefa.is_aberta(StatusTarefa.CONCLUIDA)


# ── Diligência ────────────────────────────────────────────

def test_diligencia_fluxo():
    assert StatusDiligencia.RECEBIDA.can_transition_to(StatusDiligencia.DISTRIBUIDA)
    assert StatusDiligencia.DISTRIBUIDA.can_transition_to(StatusDiligencia.EM_ATENDIMENTO)
    assert StatusDiligencia.EM_ATENDIMENTO.can_transition_to(StatusDiligencia.RESPONDIDA_INTERNAMENTE)
    assert StatusDiligencia.RESPONDIDA_INTERNAMENTE.can_transition_to(StatusDiligencia.PROTOCOLADA)
    assert StatusDiligencia.PROTOCOLADA.can_transition_to(StatusDiligencia.ACEITA)
    assert StatusDiligencia.PROTOCOLADA.can_transition_to(StatusDiligencia.NOVA_CORRECAO_SOLICITADA)
    assert StatusDiligencia.NOVA_CORRECAO_SOLICITADA.can_transition_to(StatusDiligencia.EM_ATENDIMENTO)


def test_diligencia_encerrada_final():
    assert not StatusDiligencia.ENCERRADA.can_transition_to(StatusDiligencia.EM_ATENDIMENTO)
    with pytest.raises(ValueError):
        StatusDiligencia.ENCERRADA.assert_transition(StatusDiligencia.ACEITA)


# ── Prestação de Contas ───────────────────────────────────

def test_prestacao_fluxo():
    assert StatusPrestacao.EM_PREPARACAO.can_transition_to(StatusPrestacao.PRONTA)
    assert StatusPrestacao.PRONTA.can_transition_to(StatusPrestacao.ENVIADA)
    assert StatusPrestacao.ENVIADA.can_transition_to(StatusPrestacao.EM_ANALISE)
    assert StatusPrestacao.EM_ANALISE.can_transition_to(StatusPrestacao.APROVADA)
    assert StatusPrestacao.EM_ANALISE.can_transition_to(StatusPrestacao.EM_DILIGENCIA)
    assert StatusPrestacao.EM_DILIGENCIA.can_transition_to(StatusPrestacao.EM_ANALISE)
    assert StatusPrestacao.APROVADA.can_transition_to(StatusPrestacao.ENCERRADA)


def test_prestacao_aprovada_nao_reabre():
    assert not StatusPrestacao.APROVADA.can_transition_to(StatusPrestacao.EM_ANALISE)
    with pytest.raises(ValueError):
        StatusPrestacao.APROVADA.assert_transition(StatusPrestacao.EM_PREPARACAO)


# ── Contestação ───────────────────────────────────────────

def test_contestacao_fluxo():
    assert StatusContestacao.PENDENTE.can_transition_to(StatusContestacao.APROVADA)
    assert StatusContestacao.PENDENTE.can_transition_to(StatusContestacao.REJEITADA)
    assert not StatusContestacao.APROVADA.can_transition_to(StatusContestacao.PENDENTE)
