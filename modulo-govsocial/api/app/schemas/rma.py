import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class RmaAjusteCreate(BaseModel):
    bloco: str = Field(..., max_length=50)
    campo: str = Field(..., max_length=100)
    valor_calculado: int
    valor_ajustado: int = Field(..., ge=0)
    justificativa: str


class RmaAjusteOut(BaseModel):
    id: uuid.UUID
    bloco: str
    campo: str
    valor_calculado: int
    valor_ajustado: int
    justificativa: str
    ajustado_por_id: Optional[uuid.UUID]
    created_at: datetime


class RmaFechamentoOut(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    ano: int
    mes: int
    status: str
    fechado_por_id: Optional[uuid.UUID]
    fechado_em: Optional[datetime]
    reaberto_por_id: Optional[uuid.UUID]
    reaberto_em: Optional[datetime]
    motivo_reabertura: Optional[str]
    dados_calculados: Optional[dict]
    calculado_em: Optional[datetime]
    ajustes: list[RmaAjusteOut] = []
    created_at: datetime
    updated_at: datetime


class RmaFechamentoListItem(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    ano: int
    mes: int
    status: str
    calculado_em: Optional[datetime]
    fechado_em: Optional[datetime]


class RmaReaberturaCreate(BaseModel):
    motivo_reabertura: str


class RmaDrillDown(BaseModel):
    bloco: str
    campo: str
    valor: int
    registros: list[dict] = []
