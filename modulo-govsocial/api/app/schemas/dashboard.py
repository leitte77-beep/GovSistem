import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


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
