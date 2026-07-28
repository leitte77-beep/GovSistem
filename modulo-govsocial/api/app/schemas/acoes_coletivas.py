import uuid
from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel, Field


# ── Ação Coletiva ─────────────────────────────────────────────────────
class AcaoColetivaCreate(BaseModel):
    unit_id: uuid.UUID
    nome: str = Field(..., max_length=255)
    descricao: Optional[str] = None
    tipo: str = "GRUPO_SCFV"
    service_type_code: Optional[str] = None
    faixa_etaria: Optional[str] = None
    publico_alvo: Optional[str] = None
    data_inicio: date
    data_fim: Optional[date] = None
    periodicidade: Optional[str] = None
    dia_semana: Optional[str] = None
    horario_inicio: Optional[time] = None
    horario_fim: Optional[time] = None
    local: Optional[str] = None
    vagas_total: Optional[int] = None
    profissional_responsavel_id: Optional[uuid.UUID] = None


class AcaoColetivaUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    tipo: Optional[str] = None
    faixa_etaria: Optional[str] = None
    publico_alvo: Optional[str] = None
    data_fim: Optional[date] = None
    periodicidade: Optional[str] = None
    dia_semana: Optional[str] = None
    horario_inicio: Optional[time] = None
    horario_fim: Optional[time] = None
    local: Optional[str] = None
    vagas_total: Optional[int] = None
    vagas_disponiveis: Optional[int] = None
    status: Optional[str] = None
    profissional_responsavel_id: Optional[uuid.UUID] = None


class AcaoColetivaOut(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    nome: str
    descricao: Optional[str]
    tipo: str
    service_type_code: Optional[str]
    faixa_etaria: Optional[str]
    publico_alvo: Optional[str]
    data_inicio: date
    data_fim: Optional[date]
    periodicidade: Optional[str]
    dia_semana: Optional[str]
    horario_inicio: Optional[time]
    horario_fim: Optional[time]
    local: Optional[str]
    vagas_total: Optional[int]
    vagas_disponiveis: Optional[int]
    status: str
    profissional_responsavel_id: Optional[uuid.UUID]
    total_inscritos: int = 0
    created_at: datetime
    updated_at: datetime


# ── Inscrição ─────────────────────────────────────────────────────────
class InscricaoCreate(BaseModel):
    person_id: uuid.UUID
    family_id: Optional[uuid.UUID] = None
    status: str = "ATIVA"


class InscricaoUpdate(BaseModel):
    status: Optional[str] = None
    motivo_desligamento: Optional[str] = None


class InscricaoOut(BaseModel):
    id: uuid.UUID
    acao_coletiva_id: uuid.UUID
    person_id: uuid.UUID
    family_id: Optional[uuid.UUID]
    data_inscricao: datetime
    status: str
    motivo_desligamento: Optional[str]
    created_at: datetime


# ── Encontro / Frequência ─────────────────────────────────────────────
class EncontroCreate(BaseModel):
    data_encontro: date
    tema: Optional[str] = None
    observacoes: Optional[str] = None


class EncontroOut(BaseModel):
    id: uuid.UUID
    acao_coletiva_id: uuid.UUID
    data_encontro: date
    tema: Optional[str]
    observacoes: Optional[str]
    total_presentes: int = 0
    total_faltas: int = 0
    created_at: datetime


class FrequenciaRegistro(BaseModel):
    """Registro de presença/falta individual num encontro."""
    inscricao_id: uuid.UUID
    presente: bool = True
    justificativa: Optional[str] = None


class FrequenciaOut(BaseModel):
    id: uuid.UUID
    encontro_id: uuid.UUID
    inscricao_id: uuid.UUID
    presente: bool
    justificativa: Optional[str]
    created_at: datetime


# ── Relatório de participação ─────────────────────────────────────────
class ParticipanteRelatorio(BaseModel):
    person_id: uuid.UUID
    inscricao_id: uuid.UUID
    total_encontros: int
    total_presente: int
    total_falta: int
    percentual_presenca: float
