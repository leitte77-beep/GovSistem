import uuid
from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Acompanhamento ──────────────────────────────────────────────────
class AcompanhamentoCreate(BaseModel):
    tipo: str = Field(
        ..., max_length=20, description="PAIF, PAEFI, MSE-LA, MSE-PSC"
    )
    data_inicio: date
    profissional_responsavel_id: Optional[uuid.UUID] = None
    observacoes: Optional[str] = None


class AcompanhamentoUpdate(BaseModel):
    situacao: Optional[str] = None
    data_fim: Optional[date] = None
    motivo_desligamento: Optional[str] = None
    observacoes: Optional[str] = None
    profissional_responsavel_id: Optional[uuid.UUID] = None


class AcompanhamentoOut(BaseModel):
    id: uuid.UUID
    case_file_id: uuid.UUID
    tipo: str
    data_inicio: date
    data_fim: Optional[date]
    motivo_desligamento: Optional[str]
    situacao: str
    observacoes: Optional[str]
    profissional_responsavel_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime


# ── Plano de Acompanhamento ─────────────────────────────────────────
class PlanoCreate(BaseModel):
    diagnostico: Optional[str] = None
    vulnerabilidades: Optional[str] = None
    potencialidades: Optional[str] = None
    objetivos: Optional[str] = None
    data_proxima_avaliacao: Optional[date] = None


class PlanoUpdate(BaseModel):
    diagnostico: Optional[str] = None
    vulnerabilidades: Optional[str] = None
    potencialidades: Optional[str] = None
    objetivos: Optional[str] = None
    data_proxima_avaliacao: Optional[date] = None


class PlanoOut(BaseModel):
    id: uuid.UUID
    acompanhamento_id: uuid.UUID
    case_file_id: uuid.UUID
    diagnostico: Optional[str]
    vulnerabilidades: Optional[str]
    potencialidades: Optional[str]
    objetivos: Optional[str]
    data_proxima_avaliacao: Optional[date]
    acoes: list["AcaoPlanoOut"] = []
    avaliacoes: list["AvaliacaoPlanoOut"] = []
    created_at: datetime
    updated_at: datetime


# ── Ações do Plano ──────────────────────────────────────────────────
class AcaoPlanoCreate(BaseModel):
    descricao: str
    responsavel_id: Optional[uuid.UUID] = None
    prazo: Optional[date] = None


class AcaoPlanoUpdate(BaseModel):
    descricao: Optional[str] = None
    responsavel_id: Optional[uuid.UUID] = None
    prazo: Optional[date] = None
    status: Optional[str] = None


class AcaoPlanoOut(BaseModel):
    id: uuid.UUID
    plano_id: uuid.UUID
    descricao: str
    responsavel_id: Optional[uuid.UUID]
    prazo: Optional[date]
    status: str
    data_conclusao: Optional[date]
    created_at: datetime


# ── Avaliações do Plano ─────────────────────────────────────────────
class AvaliacaoPlanoCreate(BaseModel):
    data_avaliacao: date
    avaliador_id: Optional[uuid.UUID] = None
    evolucao: Optional[str] = None
    resultado: Optional[str] = "PARCIAL"
    nova_data_avaliacao: Optional[date] = None


class AvaliacaoPlanoOut(BaseModel):
    id: uuid.UUID
    plano_id: uuid.UUID
    data_avaliacao: date
    avaliador_id: Optional[uuid.UUID]
    resultado: str
    nova_data_avaliacao: Optional[date]
    evolucao: Optional[str] = None
    evolucao_restrita: bool = False
    created_at: datetime


# ── PIA ─────────────────────────────────────────────────────────────
class PiaCreate(BaseModel):
    acompanhamento_id: Optional[uuid.UUID] = None
    numero_processo: str = Field(..., max_length=120)
    vara: Optional[str] = None
    comarca: Optional[str] = None
    medida_socioeducativa: str = Field(..., max_length=30)
    prazo_medida: Optional[int] = None
    data_inicio_medida: Optional[date] = None
    data_fim_medida: Optional[date] = None
    frequencia_cumprimento: Optional[str] = None
    dias_cumprimento: Optional[Any] = None
    objetivos: Optional[str] = None
    acoes: Optional[list[dict]] = None
    proximo_relatorio_judiciario: Optional[date] = None


class PiaUpdate(BaseModel):
    acompanhamento_id: Optional[uuid.UUID] = None
    numero_processo: Optional[str] = None
    vara: Optional[str] = None
    comarca: Optional[str] = None
    medida_socioeducativa: Optional[str] = None
    prazo_medida: Optional[int] = None
    data_inicio_medida: Optional[date] = None
    data_fim_medida: Optional[date] = None
    frequencia_cumprimento: Optional[str] = None
    dias_cumprimento: Optional[Any] = None
    objetivos: Optional[str] = None
    acoes: Optional[list[dict]] = None
    proximo_relatorio_judiciario: Optional[date] = None


class PiaOut(BaseModel):
    id: uuid.UUID
    case_file_id: uuid.UUID
    acompanhamento_id: Optional[uuid.UUID]
    numero_processo: str
    vara: Optional[str]
    comarca: Optional[str]
    medida_socioeducativa: str
    prazo_medida: Optional[int]
    data_inicio_medida: Optional[date]
    data_fim_medida: Optional[date]
    frequencia_cumprimento: Optional[str]
    dias_cumprimento: Optional[Any]
    objetivos: Optional[str]
    acoes: Optional[list[dict]]
    proximo_relatorio_judiciario: Optional[date]
    created_at: datetime
    updated_at: datetime


# ── Relatório PIA ───────────────────────────────────────────────────
class RelatorioPiaCreate(BaseModel):
    data_relatorio: date
    tipo: str = Field(..., max_length=30, description="INICIAL, ACOMPANHAMENTO, FINAL")
    elaborado_por_id: Optional[uuid.UUID] = None
    texto: Optional[str] = None


class RelatorioPiaOut(BaseModel):
    id: uuid.UUID
    pia_id: uuid.UUID
    data_relatorio: date
    tipo: str
    elaborado_por_id: Optional[uuid.UUID]
    texto: Optional[str] = None
    texto_restrito: bool = False
    created_at: datetime


# ── Alertas ─────────────────────────────────────────────────────────
class AlertaOut(BaseModel):
    tipo: str
    mensagem: str
    referencia_id: uuid.UUID
    referencia_tipo: str
    data_referencia: Optional[date] = None
    dias_em_atraso: int = 0
