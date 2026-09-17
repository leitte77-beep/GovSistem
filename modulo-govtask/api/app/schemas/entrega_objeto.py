import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import StatusEntrega, TipoEntrega


class EntregaCreate(BaseModel):
    tipo: TipoEntrega = TipoEntrega.OUTRO
    fornecedor: str | None = Field(None, max_length=255)
    data_entrega: datetime | None = None
    nota_fiscal: str | None = Field(None, max_length=50)
    quantidade: int | None = None
    identificacao: str | None = Field(None, max_length=255)
    patrimonio: str | None = Field(None, max_length=100)
    placa: str | None = Field(None, max_length=20)
    chassi: str | None = Field(None, max_length=50)
    modelo: str | None = Field(None, max_length=100)
    local_entrega: str | None = Field(None, max_length=255)
    responsavel_recebimento_id: uuid.UUID | None = None
    termo_recebimento: bool = False
    observacao: str | None = None


class EntregaUpdate(BaseModel):
    status: StatusEntrega | None = None
    termo_recebimento: bool | None = None
    observacao: str | None = None
    data_entrega: datetime | None = None
    nota_fiscal: str | None = None


class EntregaOut(BaseModel):
    id: uuid.UUID
    convenio_id: uuid.UUID
    tipo: TipoEntrega
    fornecedor: str | None
    data_entrega: datetime | None
    nota_fiscal: str | None
    quantidade: int | None
    identificacao: str | None
    patrimonio: str | None
    placa: str | None
    chassi: str | None
    modelo: str | None
    local_entrega: str | None
    responsavel_recebimento_id: uuid.UUID | None
    termo_recebimento: bool
    observacao: str | None
    status: StatusEntrega
    created_at: datetime

    model_config = {"from_attributes": True}
