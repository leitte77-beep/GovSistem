import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import StatusLicitacao


class LicitacaoCreate(BaseModel):
    numero: str | None = Field(None, max_length=100)
    modalidade: str | None = Field(None, max_length=100)
    objeto: str | None = None
    valor_estimado: Decimal | None = None
    valor_contratado: Decimal | None = None
    vencedor: str | None = Field(None, max_length=255)
    cnpj_vencedor: str | None = Field(None, max_length=20)
    data_disputa: datetime | None = None
    data_homologacao: datetime | None = None
    observacao: str | None = None


class LicitacaoUpdate(BaseModel):
    situacao: StatusLicitacao | None = None
    numero: str | None = None
    modalidade: str | None = None
    objeto: str | None = None
    valor_estimado: Decimal | None = None
    valor_contratado: Decimal | None = None
    vencedor: str | None = None
    cnpj_vencedor: str | None = None
    data_disputa: datetime | None = None
    data_homologacao: datetime | None = None
    observacao: str | None = None


class LicitacaoOut(BaseModel):
    id: uuid.UUID
    convenio_id: uuid.UUID
    numero: str | None
    modalidade: str | None
    objeto: str | None
    situacao: StatusLicitacao
    valor_estimado: Decimal | None
    valor_contratado: Decimal | None
    vencedor: str | None
    cnpj_vencedor: str | None
    data_disputa: datetime | None
    data_homologacao: datetime | None
    observacao: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
