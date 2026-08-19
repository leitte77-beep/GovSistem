import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import StatusMedicao


class MedicaoCreate(BaseModel):
    numero: int = Field(..., ge=1)
    periodo_inicio: datetime | None = None
    periodo_fim: datetime | None = None
    data: datetime | None = None
    valor: Decimal | None = None
    percentual: Decimal | None = None
    percentual_acumulado: Decimal | None = None
    responsavel_id: uuid.UUID | None = None
    observacao: str | None = None


class MedicaoUpdate(BaseModel):
    valor: Decimal | None = None
    percentual: Decimal | None = None
    percentual_acumulado: Decimal | None = None
    observacao: str | None = None
    periodo_inicio: datetime | None = None
    periodo_fim: datetime | None = None
    data: datetime | None = None


class MedicaoOut(BaseModel):
    id: uuid.UUID
    convenio_id: uuid.UUID
    numero: int
    periodo_inicio: datetime | None
    periodo_fim: datetime | None
    data: datetime | None
    valor: Decimal | None
    percentual: Decimal | None
    percentual_acumulado: Decimal | None
    responsavel_id: uuid.UUID | None
    observacao: str | None
    status: StatusMedicao
    aprovada_por_id: uuid.UUID | None
    data_aprovacao: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
