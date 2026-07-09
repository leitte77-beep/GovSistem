import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class EncaminhamentoCreate(BaseModel):
    case_file_id: Optional[uuid.UUID] = None
    unit_id: uuid.UUID
    tipo: str = Field(..., max_length=15, description="INTERNO ou EXTERNO")
    unidade_destino_id: Optional[uuid.UUID] = None
    profissional_destino_id: Optional[uuid.UUID] = None
    referral_code: Optional[str] = None
    instituicao_destino: Optional[str] = None
    profissional_origem_id: Optional[uuid.UUID] = None
    motivo: Optional[str] = None
    descricao: Optional[str] = None


class EncaminhamentoUpdate(BaseModel):
    motivo: Optional[str] = None
    descricao: Optional[str] = None


class EncaminhamentoOut(BaseModel):
    id: uuid.UUID
    case_file_id: Optional[uuid.UUID]
    unit_id: uuid.UUID
    tipo: str
    unidade_destino_id: Optional[uuid.UUID]
    profissional_destino_id: Optional[uuid.UUID]
    data_aceite: Optional[datetime]
    data_devolutiva: Optional[datetime]
    referral_code: Optional[str]
    instituicao_destino: Optional[str]
    numero_oficio: Optional[int]
    profissional_origem_id: Optional[uuid.UUID]
    data_encaminhamento: datetime
    motivo: Optional[str]
    descricao: Optional[str]
    status: str
    devolutiva: Optional[str] = None
    motivo_recusa: Optional[str]
    oficio_gerado: bool
    created_at: datetime
    updated_at: datetime


class DevolutivaCreate(BaseModel):
    """Contrarreferência do encaminhamento (unidade destino devolve para origem)."""
    devolutiva: Optional[str] = None


class AceiteCreate(BaseModel):
    profissional_destino_id: Optional[uuid.UUID] = None


class RecusaCreate(BaseModel):
    motivo_recusa: str


class EncaminhamentoListItem(BaseModel):
    id: uuid.UUID
    case_file_id: Optional[uuid.UUID]
    unit_id: uuid.UUID
    tipo: str
    unidade_destino_id: Optional[uuid.UUID]
    referral_code: Optional[str]
    instituicao_destino: Optional[str]
    data_encaminhamento: datetime
    status: str
    numero_oficio: Optional[int]
