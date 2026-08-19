import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import OrigemDiligencia, StatusDiligencia


class DiligenciaCreate(BaseModel):
    origem: OrigemDiligencia = OrigemDiligencia.GOVERNO_FEDERAL
    origem_descricao: str | None = Field(None, max_length=255)
    data_recebimento: datetime | None = None
    protocolo: str | None = Field(None, max_length=100)
    descricao: str = Field(..., min_length=3)
    prazo: datetime | None = None
    responsavel_id: uuid.UUID | None = None
    setor_destino_id: uuid.UUID | None = None
    tarefa_id: uuid.UUID | None = None
    etapa_id: uuid.UUID | None = None


class DiligenciaUpdate(BaseModel):
    status: StatusDiligencia | None = None
    responsavel_id: uuid.UUID | None = None
    setor_destino_id: uuid.UUID | None = None
    prazo: datetime | None = None
    protocolo: str | None = None


class DiligenciaResponder(BaseModel):
    resposta_interna: str = Field(..., min_length=3)
    resposta_protocolo: str | None = Field(None, max_length=100)


class DiligenciaProtocolar(BaseModel):
    resposta_protocolo: str = Field(..., max_length=100)


class DiligenciaOut(BaseModel):
    id: uuid.UUID
    convenio_id: uuid.UUID
    origem: OrigemDiligencia
    origem_descricao: str | None
    data_recebimento: datetime | None
    protocolo: str | None
    descricao: str
    prazo: datetime | None
    responsavel_id: uuid.UUID | None
    setor_destino_id: uuid.UUID | None
    status: StatusDiligencia
    tarefa_id: uuid.UUID | None
    etapa_id: uuid.UUID | None
    resposta_interna: str | None
    resposta_data: datetime | None
    resposta_protocolo: str | None
    data_encerramento: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DiligenciaListItem(BaseModel):
    id: uuid.UUID
    convenio_id: uuid.UUID
    origem: OrigemDiligencia
    origem_descricao: str | None
    descricao: str
    status: StatusDiligencia
    prazo: datetime | None
    responsavel_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}
