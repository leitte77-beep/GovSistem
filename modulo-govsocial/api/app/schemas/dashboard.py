import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class DashboardOverviewOut(BaseModel):
    atendimentos_mes: int
    acompanhamentos_ativos: int
    familias_cadastradas: int
    beneficios_concedidos_mes: int
    encaminhamentos_pendentes: int
    grupos_ativos: int
    inscritos_scfv: int


class TimeSeriesItem(BaseModel):
    ano: int
    mes: int
    atendimentos: int
    beneficios: int


class TerritoryItem(BaseModel):
    territorio: str
    total_familias: int


class MapItem(BaseModel):
    territorio: str
    bairro: str
    total_familias: int
    centroide_lat: Optional[float]
    centroide_lng: Optional[float]


class BenefitReportItem(BaseModel):
    tipo_beneficio: str
    total_concessoes: int
    valor_total: float


class FaixaRendaItem(BaseModel):
    faixa: str
    total: int


class IndicatorsOut(BaseModel):
    total_familias: int
    pbf: int
    pbf_percentual: float
    bpc: int
    bpc_percentual: float
    cadunico_desatualizado_24m: int
    inseguranca_alimentar: int
    renda_por_faixa: list[FaixaRendaItem]


class RecommendationScopeOut(BaseModel):
    """Contadores que alimentam as recomendacoes do inicio (InicioPorPerfil).

    Unico schema do dashboard em camelCase: as regras do frontend leem as
    chaves cruas da resposta (rmaFechado, diasAteFimDoMes...), entao os
    aliases fazem parte do contrato e nao podem virar snake_case.
    """

    model_config = ConfigDict(populate_by_name=True)

    rma_fechado: bool = Field(alias="rmaFechado")
    dias_ate_fim_do_mes: int = Field(alias="diasAteFimDoMes")
    mes_atual: str = Field(alias="mesAtual")
    nis_pendentes: int = Field(alias="nisPendentes")
    sem_atendimento_90d: int = Field(alias="semAtendimento90d")
    agendamentos_hoje: int = Field(alias="agendamentosHoje")
    aniversariantes_semana: int = Field(alias="aniversariantesSemana")
    encaminhamentos_prazo: int = Field(alias="encaminhamentosPrazo")


class DashboardActivityItem(BaseModel):
    id: uuid.UUID
    texto: str
    descricao: str = ""
    categoria: str = ""
    entidade: str
    data: datetime
    acao: str
    ator: str | None = None
    nome: str | None = None
    competencia: str | None = None
