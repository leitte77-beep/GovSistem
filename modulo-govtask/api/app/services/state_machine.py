"""Validates and executes state transitions for GovTask entities."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.convenio import Convenio
from app.models.enums import (
    StatusContestacao,
    StatusConvenio,
    StatusEtapa,
    StatusTarefa,
    TipoEvento,
)
from app.models.contestacao import Contestacao
from app.models.etapa import Etapa
from app.models.tarefa import Tarefa


class InvalidTransitionError(ValueError):
    """Raised when a state transition is not allowed."""
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Convênio ──────────────────────────────────────────────

async def iniciar_convenio(convenio: Convenio, db: AsyncSession) -> None:
    """RASCUNHO → EM_ANDAMENTO"""
    convenio.status.assert_transition(StatusConvenio.EM_ANDAMENTO)
    convenio.status = StatusConvenio.EM_ANDAMENTO


async def suspender_convenio(convenio: Convenio, db: AsyncSession) -> None:
    """EM_ANDAMENTO → SUSPENSO"""
    convenio.status.assert_transition(StatusConvenio.SUSPENSO)
    convenio.status = StatusConvenio.SUSPENSO


async def reativar_convenio(convenio: Convenio, db: AsyncSession) -> None:
    """SUSPENSO → EM_ANDAMENTO"""
    convenio.status.assert_transition(StatusConvenio.EM_ANDAMENTO)
    convenio.status = StatusConvenio.EM_ANDAMENTO


async def concluir_convenio(convenio: Convenio, db: AsyncSession) -> None:
    """EM_ANDAMENTO → CONCLUIDO"""
    convenio.status.assert_transition(StatusConvenio.CONCLUIDO)
    convenio.status = StatusConvenio.CONCLUIDO


async def cancelar_convenio(convenio: Convenio, db: AsyncSession) -> None:
    """→ CANCELADO"""
    convenio.status.assert_transition(StatusConvenio.CANCELADO)
    convenio.status = StatusConvenio.CANCELADO


# ── Etapa ─────────────────────────────────────────────────

async def iniciar_etapa(etapa: Etapa, db: AsyncSession) -> None:
    """PENDENTE → EM_ANDAMENTO"""
    etapa.status.assert_transition(StatusEtapa.EM_ANDAMENTO)
    etapa.status = StatusEtapa.EM_ANDAMENTO
    if not etapa.data_inicio:
        etapa.data_inicio = _now()


async def encaminhar_ao_governo(etapa: Etapa, db: AsyncSession) -> None:
    """EM_ANDAMENTO → AGUARDANDO_GOVERNO"""
    etapa.status.assert_transition(StatusEtapa.AGUARDANDO_GOVERNO)
    etapa.status = StatusEtapa.AGUARDANDO_GOVERNO


async def voltar_etapa_para_andamento(etapa: Etapa, db: AsyncSession) -> None:
    """AGUARDANDO_GOVERNO → EM_ANDAMENTO (retrabalho)"""
    etapa.status.assert_transition(StatusEtapa.EM_ANDAMENTO)
    etapa.status = StatusEtapa.EM_ANDAMENTO


async def concluir_etapa(etapa: Etapa, db: AsyncSession) -> None:
    """→ CONCLUIDA"""
    etapa.status.assert_transition(StatusEtapa.CONCLUIDA)
    etapa.status = StatusEtapa.CONCLUIDA
    etapa.data_conclusao = _now()


async def bloquear_etapa(etapa: Etapa, db: AsyncSession) -> None:
    """→ BLOQUEADA"""
    etapa.status.assert_transition(StatusEtapa.BLOQUEADA)
    etapa.status = StatusEtapa.BLOQUEADA


# ── Tarefa ────────────────────────────────────────────────

async def aceitar_tarefa(tarefa: Tarefa, db: AsyncSession) -> None:
    """AGUARDANDO_ACEITE → EM_ANDAMENTO"""
    tarefa.status.assert_transition(StatusTarefa.EM_ANDAMENTO)
    tarefa.status = StatusTarefa.EM_ANDAMENTO
    tarefa.data_aceite = _now()


async def entregar_tarefa(tarefa: Tarefa, db: AsyncSession) -> None:
    """EM_ANDAMENTO → ENTREGUE"""
    tarefa.status.assert_transition(StatusTarefa.ENTREGUE)
    tarefa.status = StatusTarefa.ENTREGUE
    tarefa.data_entrega = _now()


async def devolver_tarefa(tarefa: Tarefa, db: AsyncSession) -> None:
    """ENTREGUE → DEVOLVIDA"""
    tarefa.status.assert_transition(StatusTarefa.DEVOLVIDA)
    tarefa.status = StatusTarefa.DEVOLVIDA


async def retomar_tarefa(tarefa: Tarefa, db: AsyncSession) -> None:
    """DEVOLVIDA → EM_ANDAMENTO"""
    tarefa.status.assert_transition(StatusTarefa.EM_ANDAMENTO)
    tarefa.status = StatusTarefa.EM_ANDAMENTO


async def concluir_tarefa(tarefa: Tarefa, db: AsyncSession) -> None:
    """ENTREGUE → CONCLUIDA"""
    tarefa.status.assert_transition(StatusTarefa.CONCLUIDA)
    tarefa.status = StatusTarefa.CONCLUIDA
    tarefa.data_conclusao = _now()


async def contestar_tarefa(tarefa: Tarefa, db: AsyncSession) -> None:
    """EM_ANDAMENTO → CONTESTADA"""
    tarefa.status.assert_transition(StatusTarefa.CONTESTADA)
    tarefa.status = StatusTarefa.CONTESTADA


async def voltar_de_contestacao(tarefa: Tarefa, db: AsyncSession) -> None:
    """CONTESTADA → EM_ANDAMENTO"""
    tarefa.status.assert_transition(StatusTarefa.EM_ANDAMENTO)
    tarefa.status = StatusTarefa.EM_ANDAMENTO


async def cancelar_tarefa(tarefa: Tarefa, db: AsyncSession) -> None:
    """→ CANCELADA"""
    tarefa.status.assert_transition(StatusTarefa.CANCELADA)
    tarefa.status = StatusTarefa.CANCELADA


# ── Contestação ───────────────────────────────────────────

async def aprovar_contestacao(
    contestacao: Contestacao, decidido_por_id: str, justificativa: str | None, db: AsyncSession
) -> None:
    """PENDENTE → APROVADA; atualiza prazo da tarefa"""
    contestacao.status = StatusContestacao.APROVADA
    contestacao.decidido_por_id = decidido_por_id
    contestacao.justificativa_decisao = justificativa
    contestacao.data_decisao = _now()
    # O prazo da tarefa será atualizado pelo caller


async def rejeitar_contestacao(
    contestacao: Contestacao, decidido_por_id: str, justificativa: str | None, db: AsyncSession
) -> None:
    """PENDENTE → REJEITADA"""
    contestacao.status = StatusContestacao.REJEITADA
    contestacao.decidido_por_id = decidido_por_id
    contestacao.justificativa_decisao = justificativa
    contestacao.data_decisao = _now()
