import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Case files (prontuário) ───────────────────────────────────────
class CaseFileCreate(BaseModel):
    family_id: uuid.UUID
    unit_id: uuid.UUID
    service_type_code: str = Field(..., max_length=40)
    acolhida_data: Optional[date] = None
    acolhida_access_form_code: Optional[str] = None
    acolhida_motivo: Optional[str] = None
    acolhida_profissional_id: Optional[uuid.UUID] = None


class CaseFileUpdate(BaseModel):
    status: Optional[str] = None
    acolhida_data: Optional[date] = None
    acolhida_access_form_code: Optional[str] = None
    acolhida_motivo: Optional[str] = None
    acolhida_profissional_id: Optional[uuid.UUID] = None


class CaseFileListItem(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    unit_id: uuid.UUID
    service_type_code: str
    status: str
    acolhida_data: Optional[date]
    aberto_em: datetime
    created_at: datetime


class CaseFileOut(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    unit_id: uuid.UUID
    service_type_code: str
    status: str
    acolhida_data: Optional[date]
    acolhida_access_form_code: Optional[str]
    acolhida_motivo: Optional[str]
    acolhida_profissional_id: Optional[uuid.UUID]
    aberto_em: datetime
    created_at: datetime
    updated_at: datetime


# ── Attendances (atendimentos) ────────────────────────────────────
class AttendanceCreate(BaseModel):
    data_atendimento: datetime
    tipo: str = Field(..., max_length=30)
    evolution_text: Optional[str] = None
    sigiloso_reforcado: bool = False
    registrado_por_id: Optional[uuid.UUID] = None
    member_ids: list[uuid.UUID] = []
    professional_ids: list[uuid.UUID] = []


class AttendanceUpdate(BaseModel):
    data_atendimento: Optional[datetime] = None
    tipo: Optional[str] = None
    evolution_text: Optional[str] = None
    sigiloso_reforcado: Optional[bool] = None
    member_ids: Optional[list[uuid.UUID]] = None
    professional_ids: Optional[list[uuid.UUID]] = None


class AttendanceOut(BaseModel):
    id: uuid.UUID
    case_file_id: uuid.UUID
    unit_id: uuid.UUID
    service_type_code: str
    data_atendimento: datetime
    tipo: str
    sigiloso_reforcado: bool
    registrado_por_id: Optional[uuid.UUID]
    member_ids: list[uuid.UUID] = []
    professional_ids: list[uuid.UUID] = []
    # Evolução só é preenchida quando o usuário tem permissão de leitura.
    evolution_text: Optional[str] = None
    evolution_restrita: bool = False
    created_at: datetime
    updated_at: datetime


# ── Timeline / visão de rede ──────────────────────────────────────
class TimelineItem(BaseModel):
    attendance_id: uuid.UUID
    data_atendimento: datetime
    tipo: str
    service_type_code: str
    unit_id: uuid.UUID
    sigiloso_reforcado: bool
    pode_ler_evolucao: bool


class NetworkViewItem(BaseModel):
    """Visão de rede: outras unidades veem QUE houve atendimento, sem conteúdo."""

    unit_id: uuid.UUID
    unit_nome: Optional[str] = None
    service_type_code: str
    data_atendimento: datetime
    tipo: str


# ── Recepção ──────────────────────────────────────────────────────
class ReceptionCreate(BaseModel):
    unit_id: uuid.UUID
    person_id: Optional[uuid.UUID] = None
    family_id: Optional[uuid.UUID] = None
    nome_informado: Optional[str] = None
    motivo: Optional[str] = None
    senha: Optional[str] = None


class ReceptionUpdate(BaseModel):
    status: Optional[str] = None
    person_id: Optional[uuid.UUID] = None
    family_id: Optional[uuid.UUID] = None
    motivo: Optional[str] = None


class ReceptionOut(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    data: datetime
    person_id: Optional[uuid.UUID]
    family_id: Optional[uuid.UUID]
    nome_informado: Optional[str]
    motivo: Optional[str]
    status: str
    senha: Optional[str]
    atendido_em: Optional[datetime]
    created_at: datetime


# ── Anexos ────────────────────────────────────────────────────────
class AttachmentOut(BaseModel):
    id: uuid.UUID
    case_file_id: uuid.UUID
    attendance_id: Optional[uuid.UUID]
    nome_arquivo: str
    tipo_documento: str
    content_type: Optional[str]
    tamanho_bytes: int
    versao: int
    enviado_por_id: Optional[uuid.UUID]
    created_at: datetime
