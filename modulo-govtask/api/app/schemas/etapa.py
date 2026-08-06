import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import NaturezaEtapa, StatusEtapa


class EtapaCreate(BaseModel):
    nome: str = Field(..., max_length=255)
    natureza: NaturezaEtapa = NaturezaEtapa.INTERNA
    prazo_governo: datetime | None = None
    ordem: int | None = None


class EtapaUpdate(BaseModel):
    nome: str | None = Field(None, max_length=255)
    ordem: int | None = None
    natureza: NaturezaEtapa | None = None
    prazo_governo: datetime | None = None
    status: StatusEtapa | None = None


class EncaminharGovernoRequest(BaseModel):
    observacao: str | None = None


class RespostaGovernoRequest(BaseModel):
    resposta: str = Field(..., min_length=1)


class EtapaOut(BaseModel):
    id: uuid.UUID
    convenio_id: uuid.UUID
    nome: str
    ordem: int
    natureza: NaturezaEtapa
    status: StatusEtapa
    prazo_governo: datetime | None
    resposta_governo: str | None
    data_inicio: datetime | None
    data_conclusao: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
