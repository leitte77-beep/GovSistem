import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class PanicButtonActivate(BaseModel):
    person_id: uuid.UUID
    family_id: Optional[uuid.UUID] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    address: Optional[str] = Field(None, max_length=500)


class PanicButtonAttend(BaseModel):
    notes: Optional[str] = None


class PanicButtonResolve(BaseModel):
    status: str = Field(..., pattern="^(ATENDIDO|CANCELADO|FALSO_ALARME)$")
    notes: Optional[str] = None
    medida_protetiva_numero: Optional[str] = Field(None, max_length=50)
    medida_protetiva_validade: Optional[date] = None


class PanicButtonOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    person_id: uuid.UUID
    family_id: Optional[uuid.UUID]
    activated_at: datetime
    location_lat: Optional[float]
    location_lng: Optional[float]
    location_address: Optional[str]
    status: str
    attended_by: Optional[uuid.UUID]
    attended_at: Optional[datetime]
    notes: Optional[str]
    medida_protetiva_numero: Optional[str]
    medida_protetiva_validade: Optional[date]
    created_at: datetime
    updated_at: datetime


class PanicButtonListItem(BaseModel):
    id: uuid.UUID
    person_id: uuid.UUID
    activated_at: datetime
    location_lat: Optional[float]
    location_lng: Optional[float]
    location_address: Optional[str]
    status: str
    attended_at: Optional[datetime]


class PanicButtonHistoryItem(BaseModel):
    id: uuid.UUID
    person_id: uuid.UUID
    activated_at: datetime
    status: str
    attended_by: Optional[uuid.UUID]
    attended_at: Optional[datetime]
    notes: Optional[str]
    medida_protetiva_numero: Optional[str]
    medida_protetiva_validade: Optional[date]
    created_at: datetime
