import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import StatusRepasse


class RepasseCreate(BaseModel):
    parcela: int = Field(..., ge=1)
    valor_previsto: Decimal | None = None
    data_prevista: datetime | None = None
    conta_destino: str | None = Field(None, max_length=100)
    observacao: str | None = None


class RepasseReceber(BaseModel):
    valor_recebido: Decimal = Field(..., gt=0)
    data_recebida: datetime | None = None


class RepasseUpdate(BaseModel):
    valor_previsto: Decimal | None = None
    data_prevista: datetime | None = None
    conta_destino: str | None = None
    observacao: str | None = None


class RepasseOut(BaseModel):
    id: uuid.UUID
    convenio_id: uuid.UUID
    parcela: int
    valor_previsto: Decimal | None
    valor_recebido: Decimal | None
    data_prevista: datetime | None
    data_recebida: datetime | None
    conta_destino: str | None
    observacao: str | None
    status: StatusRepasse
    registrado_por_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}
