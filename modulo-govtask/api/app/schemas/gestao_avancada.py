"""Schemas da gestão avançada (§152–§154, §196, §205–§213, §220–§222)."""

import uuid
from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    NivelRisco,
    PrioridadeDemanda,
    StatusMarco,
    StatusRisco,
    StatusWebhookEntrega,
    TipoCampoCustomizado,
    TipoContagemSla,
    TipoRelacionamentoDemanda,
)


# ── Relacionamentos (§220–§222) ─────────────────────────────────────────────

class DemandaResumoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    numero: str
    titulo: str
    progresso: int
    concluida_em: Optional[datetime] = None


class RelacionamentoCreate(BaseModel):
    relacionada_id: uuid.UUID
    tipo: TipoRelacionamentoDemanda = TipoRelacionamentoDemanda.RELACIONADA
    descricao: Optional[str] = None


class RelacionamentoOut(BaseModel):
    id: uuid.UUID
    tipo: TipoRelacionamentoDemanda
    descricao: Optional[str] = None
    relacionada: DemandaResumoOut
    created_at: datetime


class VincularPaiRequest(BaseModel):
    demanda_pai_id: uuid.UUID


class HierarquiaOut(BaseModel):
    pai: Optional[DemandaResumoOut] = None
    filhas: list[DemandaResumoOut] = []
    relacionamentos: list[RelacionamentoOut] = []
    tem_filhas: bool
    total_filhas: int
    filhas_concluidas: int
    progresso_filhas: Optional[int] = None
    progresso_agregado: int


# ── Marcos (§213) ───────────────────────────────────────────────────────────

class MarcoCreate(BaseModel):
    titulo: str = Field(min_length=3, max_length=255)
    descricao: Optional[str] = None
    ordem: int = 0
    data_prevista: Optional[datetime] = None
    responsavel_id: Optional[uuid.UUID] = None


class MarcoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    titulo: Optional[str] = Field(default=None, min_length=3, max_length=255)
    descricao: Optional[str] = None
    ordem: Optional[int] = None
    data_prevista: Optional[datetime] = None
    responsavel_id: Optional[uuid.UUID] = None


class MarcoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    titulo: str
    descricao: Optional[str] = None
    ordem: int
    status: StatusMarco
    data_prevista: Optional[datetime] = None
    data_realizada: Optional[datetime] = None
    responsavel_id: Optional[uuid.UUID] = None
    atrasado: bool = False
    created_at: datetime


class ConcluirMarcoRequest(BaseModel):
    data_realizada: Optional[datetime] = None
    observacao: Optional[str] = None


# ── Riscos (§211) ───────────────────────────────────────────────────────────

class RiscoCreate(BaseModel):
    descricao: str = Field(min_length=3)
    categoria: Optional[str] = Field(default=None, max_length=60)
    probabilidade: int = Field(default=3, ge=1, le=5)
    impacto: int = Field(default=3, ge=1, le=5)
    mitigacao: Optional[str] = None
    status: StatusRisco = StatusRisco.IDENTIFICADO
    previsao: Optional[date] = None
    responsavel_id: Optional[uuid.UUID] = None


class RiscoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    descricao: Optional[str] = Field(default=None, min_length=3)
    categoria: Optional[str] = None
    probabilidade: Optional[int] = Field(default=None, ge=1, le=5)
    impacto: Optional[int] = Field(default=None, ge=1, le=5)
    mitigacao: Optional[str] = None
    status: Optional[StatusRisco] = None
    previsao: Optional[date] = None
    responsavel_id: Optional[uuid.UUID] = None


class RiscoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    descricao: str
    categoria: Optional[str] = None
    probabilidade: int
    impacto: int
    score: int
    nivel: NivelRisco
    mitigacao: Optional[str] = None
    status: StatusRisco
    previsao: Optional[date] = None
    resolvido_em: Optional[datetime] = None
    responsavel_id: Optional[uuid.UUID] = None
    created_at: datetime


# ── Campos customizados (§205, §206) ────────────────────────────────────────

class CampoCustomizadoCreate(BaseModel):
    chave: str = Field(min_length=1, max_length=60)
    rotulo: str = Field(min_length=1, max_length=120)
    tipo: TipoCampoCustomizado
    tipo_demanda_id: Optional[uuid.UUID] = None
    obrigatorio: bool = False
    ativo: bool = True
    ordem: int = 0
    ajuda: Optional[str] = None
    opcoes: Optional[list[Any]] = None
    validacao: Optional[dict] = None


class CampoCustomizadoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rotulo: Optional[str] = Field(default=None, min_length=1, max_length=120)
    tipo_demanda_id: Optional[uuid.UUID] = None
    obrigatorio: Optional[bool] = None
    ativo: Optional[bool] = None
    ordem: Optional[int] = None
    ajuda: Optional[str] = None
    opcoes: Optional[list[Any]] = None
    validacao: Optional[dict] = None


class CampoCustomizadoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    chave: str
    rotulo: str
    tipo: TipoCampoCustomizado
    tipo_demanda_id: Optional[uuid.UUID] = None
    obrigatorio: bool
    ativo: bool
    ordem: int
    ajuda: Optional[str] = None
    opcoes: Optional[list[Any]] = None
    validacao: Optional[dict] = None


# ── SLA interno (§152–§154) ─────────────────────────────────────────────────

class SlaConfigCreate(BaseModel):
    tipo_demanda_id: Optional[uuid.UUID] = None
    setor_id: Optional[uuid.UUID] = None
    prioridade: Optional[PrioridadeDemanda] = None
    valor: int = Field(ge=1, le=3650)
    contagem: TipoContagemSla = TipoContagemSla.DIAS_UTEIS
    descricao: Optional[str] = None
    ativo: bool = True


class SlaConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    valor: Optional[int] = Field(default=None, ge=1, le=3650)
    contagem: Optional[TipoContagemSla] = None
    descricao: Optional[str] = None
    ativo: Optional[bool] = None


class SlaConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tipo_demanda_id: Optional[uuid.UUID] = None
    setor_id: Optional[uuid.UUID] = None
    prioridade: Optional[PrioridadeDemanda] = None
    valor: int
    contagem: TipoContagemSla
    descricao: Optional[str] = None
    ativo: bool


class SlaDemandaOut(BaseModel):
    config_id: str
    valor: int
    contagem: TipoContagemSla
    vencimento: datetime
    situacao: str
    horas_restantes: float


# ── Webhooks (§196) ─────────────────────────────────────────────────────────

class WebhookCreate(BaseModel):
    url: str = Field(min_length=8, max_length=500)
    descricao: Optional[str] = Field(default=None, max_length=255)
    eventos: Optional[list[str]] = None


class WebhookUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: Optional[str] = Field(default=None, min_length=8, max_length=500)
    descricao: Optional[str] = None
    eventos: Optional[list[str]] = None
    ativo: Optional[bool] = None


class WebhookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    url: str
    descricao: Optional[str] = None
    eventos: Optional[list[str]] = None
    ativo: bool
    ultima_entrega_em: Optional[datetime] = None
    ultimo_status: Optional[str] = None
    created_at: datetime


class WebhookCriadoOut(WebhookOut):
    secret: str


class WebhookEntregaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    evento: str
    status: StatusWebhookEntrega
    tentativas: int
    http_status: Optional[int] = None
    erro: Optional[str] = None
    entregue_em: Optional[datetime] = None
    created_at: datetime


# ── Ações em lote (§188, §189) ──────────────────────────────────────────────

class LoteAtribuirRequest(BaseModel):
    demanda_ids: list[uuid.UUID] = Field(min_length=1, max_length=100)
    responsavel_id: uuid.UUID
    motivo: str = Field(min_length=3, description="Exigido pela auditoria da operação")


class LotePrioridadeRequest(BaseModel):
    demanda_ids: list[uuid.UUID] = Field(min_length=1, max_length=100)
    prioridade: PrioridadeDemanda
    motivo: str = Field(min_length=3)


class LoteTagsRequest(BaseModel):
    demanda_ids: list[uuid.UUID] = Field(min_length=1, max_length=100)
    tags: list[str] = Field(min_length=1)
    motivo: str = Field(min_length=3)


class LoteResultado(BaseModel):
    atualizadas: int
    ignoradas: list[uuid.UUID] = []
