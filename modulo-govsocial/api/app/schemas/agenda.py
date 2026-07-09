import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AppointmentCreate(BaseModel):
    unit_id: uuid.UUID
    professional_id: Optional[uuid.UUID] = None
    person_id: Optional[uuid.UUID] = None
    family_id: Optional[uuid.UUID] = None
    tipo: str = "ATENDIMENTO"
    data_hora_inicio: datetime
    data_hora_fim: Optional[datetime] = None
    observacoes: Optional[str] = None
    opt_in_lembrete: bool = False


class AppointmentUpdate(BaseModel):
    professional_id: Optional[uuid.UUID] = None
    status: Optional[str] = None
    data_hora_inicio: Optional[datetime] = None
    data_hora_fim: Optional[datetime] = None
    observacoes: Optional[str] = None


class AppointmentOut(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    professional_id: Optional[uuid.UUID]
    person_id: Optional[uuid.UUID]
    family_id: Optional[uuid.UUID]
    tipo: str
    status: str
    data_hora_inicio: datetime
    data_hora_fim: Optional[datetime]
    observacoes: Optional[str]
    senha: Optional[str]
    lembrete_enviado: bool
    opt_in_lembrete: bool
    created_at: datetime
    updated_at: datetime


class SenhaChamada(BaseModel):
    """Chamar próximo da fila."""
    professional_id: uuid.UUID


class VisitaCreate(BaseModel):
    family_id: uuid.UUID
    unit_id: uuid.UUID
    professional_id: Optional[uuid.UUID] = None
    data_planejada: datetime
    observacoes: Optional[str] = None


class VisitaUpdate(BaseModel):
    status: Optional[str] = None
    data_realizada: Optional[datetime] = None
    endereco_confirmado: Optional[str] = None
    observacoes: Optional[str] = None
    attendance_id: Optional[uuid.UUID] = None


class VisitaOut(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    unit_id: uuid.UUID
    professional_id: Optional[uuid.UUID]
    attendance_id: Optional[uuid.UUID]
    data_planejada: datetime
    data_realizada: Optional[datetime]
    status: str
    endereco_confirmado: Optional[str]
    observacoes: Optional[str]
    created_at: datetime
    updated_at: datetime
