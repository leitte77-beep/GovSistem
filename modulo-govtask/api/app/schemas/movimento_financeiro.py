import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import TipoMovimento


class MovimentoCreate(BaseModel):
    tipo: TipoMovimento
    numero: str | None = Field(None, max_length=100)
    data: datetime | None = None
    valor: Decimal | None = None
    favorecido: str | None = Field(None, max_length=255)
    descricao: str | None = None
    medicao_id: uuid.UUID | None = None
    contrato_id: uuid.UUID | None = None


class MovimentoOut(BaseModel):
    id: uuid.UUID
    convenio_id: uuid.UUID
    tipo: TipoMovimento
    numero: str | None
    data: datetime | None
    valor: Decimal | None
    favorecido: str | None
    descricao: str | None
    medicao_id: uuid.UUID | None
    contrato_id: uuid.UUID | None
    registro_por_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class ResumoFinanceiro(BaseModel):
    valor_aprovado: Decimal | None
    valor_recebido: Decimal | None
    contrapartida: Decimal | None
    rendimentos: Decimal | None
    total_disponivel: Decimal | None
    empenhado: Decimal | None
    liquidado: Decimal | None
    pago: Decimal | None
    saldo: Decimal | None
    percentual_executado: float | None
    percentual_pago: float | None
