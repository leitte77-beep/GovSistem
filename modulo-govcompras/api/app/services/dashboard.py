"""Indicadores do dashboard (seções 5-6, 90, 135-137).

Todo cálculo é feito on-read, direto no banco — sem tabela de indicadores
pré-calculada. Para o volume de dados de uma POC/município médio isso é
suficiente; se crescer, o mesmo SQL vira a base de uma view materializada.
"""

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import suporta_bloqueio_linha
from app.models.ata import AtaRegistroPreco
from app.models.contrato import Contrato
from app.models.enums import StatusGeralProcesso
from app.models.processo import ProcessoHistoricoEtapa, ProcessoInstancia
from app.models.workflow import WorkflowEtapa
from app.services.workflow import calcular_status_sla


async def contadores_processos(db: AsyncSession, organizacao_id: uuid.UUID) -> dict:
    processos = (
        await db.scalars(
            select(ProcessoInstancia).where(
                ProcessoInstancia.organizacao_id == organizacao_id,
                ProcessoInstancia.status_geral == StatusGeralProcesso.EM_ANDAMENTO.value,
            )
        )
    ).all()

    por_etapa: dict[str, int] = {}
    atrasados = 0
    valor_em_contratacao = 0.0
    agora = datetime.now(timezone.utc)

    for processo in processos:
        valor_em_contratacao += float(processo.valor_estimado or 0)
        if processo.etapa_atual_id is None:
            continue
        etapa = await db.get(WorkflowEtapa, processo.etapa_atual_id)
        if etapa is None:
            continue
        por_etapa[etapa.codigo] = por_etapa.get(etapa.codigo, 0) + 1
        if processo.etapa_atual_iniciada_em:
            status_sla = calcular_status_sla(processo.etapa_atual_iniciada_em, etapa.sla_dias, agora)
            if status_sla.value in {"atrasado", "critico"}:
                atrasados += 1

    return {
        "processos_em_andamento": len(processos),
        "processos_atrasados": atrasados,
        "por_etapa": por_etapa,
        "valor_em_contratacao": round(valor_em_contratacao, 2),
    }


async def contratos_vencendo(db: AsyncSession, organizacao_id: uuid.UUID, dias: int = 180) -> list[Contrato]:
    limite = date.today() + timedelta(days=dias)
    resultado = await db.scalars(
        select(Contrato)
        .where(
            Contrato.organizacao_id == organizacao_id,
            Contrato.status == "vigente",
            Contrato.vigencia_fim <= limite,
        )
        .order_by(Contrato.vigencia_fim)
    )
    return list(resultado.all())


async def atas_vencendo(db: AsyncSession, organizacao_id: uuid.UUID, dias: int = 180) -> list[AtaRegistroPreco]:
    limite = date.today() + timedelta(days=dias)
    resultado = await db.scalars(
        select(AtaRegistroPreco)
        .where(
            AtaRegistroPreco.organizacao_id == organizacao_id,
            AtaRegistroPreco.status == "vigente",
            AtaRegistroPreco.vigencia_fim <= limite,
        )
        .order_by(AtaRegistroPreco.vigencia_fim)
    )
    return list(resultado.all())


async def contratos_ativos_e_valor(db: AsyncSession, organizacao_id: uuid.UUID) -> dict:
    linha = (
        await db.execute(
            select(func.count(Contrato.id), func.coalesce(func.sum(Contrato.valor_global), 0)).where(
                Contrato.organizacao_id == organizacao_id, Contrato.status == "vigente"
            )
        )
    ).one()
    return {"contratos_ativos": linha[0], "valor_contratado": float(linha[1])}


async def tempo_medio_por_etapa(db: AsyncSession, organizacao_id: uuid.UUID) -> list[dict]:
    """Relatório de gargalos (seção 77): tempo médio e maior atraso por etapa,
    considerando etapas já encerradas (`AVANCOU`/`DEVOLVIDA`).

    `func.extract("epoch", ...)` é sintaxe PostgreSQL; no SQLite dos testes a
    função simplesmente não existe, então aqui devolvemos uma lista vazia em
    vez de quebrar a suíte — a tela trata "sem dados" normalmente.
    """
    if not suporta_bloqueio_linha():
        return []
    linhas = (
        await db.execute(
            select(
                WorkflowEtapa.nome,
                func.count(ProcessoHistoricoEtapa.id),
                func.avg(
                    func.extract("epoch", ProcessoHistoricoEtapa.encerrada_em - ProcessoHistoricoEtapa.iniciada_em)
                ),
                func.max(
                    func.extract("epoch", ProcessoHistoricoEtapa.encerrada_em - ProcessoHistoricoEtapa.iniciada_em)
                ),
            )
            .join(WorkflowEtapa, WorkflowEtapa.id == ProcessoHistoricoEtapa.etapa_id)
            .join(ProcessoInstancia, ProcessoInstancia.id == ProcessoHistoricoEtapa.processo_id)
            .where(
                ProcessoInstancia.organizacao_id == organizacao_id,
                ProcessoHistoricoEtapa.encerrada_em.is_not(None),
            )
            .group_by(WorkflowEtapa.nome)
        )
    ).all()
    resultado = []
    for nome, quantidade, media_segundos, maior_segundos in linhas:
        resultado.append(
            {
                "etapa": nome,
                "quantidade_processos": quantidade,
                "tempo_medio_dias": round((media_segundos or 0) / 86400, 1),
                "maior_tempo_dias": round((maior_segundos or 0) / 86400, 1),
            }
        )
    return sorted(resultado, key=lambda item: item["tempo_medio_dias"], reverse=True)


def alertas_configurados() -> list[int]:
    return settings.ALERTAS_VENCIMENTO_DIAS
