import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import StatusContrato, TipoAditivo


class ContratoCreate(BaseModel):
    numero: str | None = Field(None, max_length=100)
    fornecedor: str | None = Field(None, max_length=255)
    cnpj: str | None = Field(None, max_length=20)
    objeto: str | None = None
    valor: Decimal | None = None
    data_assinatura: datetime | None = None
    vigencia_inicio: datetime | None = None
    vigencia_fim: datetime | None = None
    fiscal_id: uuid.UUID | None = None
    gestor_id: uuid.UUID | None = None


class ContratoUpdate(BaseModel):
    numero: str | None = None
    fornecedor: str | None = None
    cnpj: str | None = None
    objeto: str | None = None
    valor: Decimal | None = None
    data_assinatura: datetime | None = None
    vigencia_inicio: datetime | None = None
    vigencia_fim: datetime | None = None
    fiscal_id: uuid.UUID | None = None
    gestor_id: uuid.UUID | None = None
    status: StatusContrato | None = None


class AditivoCreate(BaseModel):
    numero: str | None = Field(None, max_length=100)
    tipo: TipoAditivo = TipoAditivo.OUTRO
    motivo: str | None = None
    valor: Decimal | None = None
    prazo: datetime | None = None
    data: datetime | None = None


class AditivoOut(BaseModel):
    id: uuid.UUID
    contrato_id: uuid.UUID
    numero: str | None
    tipo: TipoAditivo
    motivo: str | None
    valor: Decimal | None
    prazo: datetime | None
    data: datetime | None
    aprovado_por_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ContratoOut(BaseModel):
    id: uuid.UUID
    convenio_id: uuid.UUID
    numero: str | None
    fornecedor: str | None
    cnpj: str | None
    objeto: str | None
    valor: Decimal | None
    data_assinatura: datetime | None
    vigencia_inicio: datetime | None
    vigencia_fim: datetime | None
    fiscal_id: uuid.UUID | None
    gestor_id: uuid.UUID | None
    status: StatusContrato
    aditivos: list[AditivoOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
