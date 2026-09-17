import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import StatusPrestacao


class PrestacaoCreate(BaseModel):
    titulo: str | None = Field(None, max_length=300)
    responsavel_id: uuid.UUID | None = None


class PrestacaoItemCreate(BaseModel):
    descricao: str = Field(..., min_length=3, max_length=300)


class PrestacaoItemToggle(BaseModel):
    conferido: bool | None = None
    anexo_id: uuid.UUID | None = None
    vincular_anexo: bool = False


class PrestacaoEnviar(BaseModel):
    sistema_envio: str | None = Field(None, max_length=100)
    protocolo: str | None = Field(None, max_length=100)
    data_envio: datetime | None = None
    observacao: str | None = None


class PrestacaoDecidir(BaseModel):
    status: StatusPrestacao
    parecer: str | None = None


class PrestacaoItemOut(BaseModel):
    id: uuid.UUID
    prestacao_id: uuid.UUID
    descricao: str
    conferido: bool
    conferido_por_id: uuid.UUID | None
    data_conferencia: datetime | None
    anexo_id: uuid.UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PrestacaoOut(BaseModel):
    id: uuid.UUID
    convenio_id: uuid.UUID
    titulo: str | None
    status: StatusPrestacao
    responsavel_id: uuid.UUID | None
    data_envio: datetime | None
    sistema_envio: str | None
    protocolo: str | None
    observacao: str | None
    parecer: str | None
    data_aprovacao: datetime | None
    percentual_preparacao: int = 0
    itens: list[PrestacaoItemOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
