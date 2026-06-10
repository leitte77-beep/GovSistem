import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import StatusConvenio, TipoConvenio
from app.schemas.etapa import EtapaOut
from app.schemas.anexo import AnexoOut
from app.schemas.tarefa import TarefaListItem
from app.schemas.etapa import EtapaOut


class ConvenioCreate(BaseModel):
    titulo: str = Field(..., max_length=500)
    descricao: str | None = None
    tipo: TipoConvenio = TipoConvenio.OUTRO
    origem: str | None = None
    valor: Decimal | None = None
    template_fluxo_id: uuid.UUID | None = None


class ConvenioUpdate(BaseModel):
    titulo: str | None = Field(None, max_length=500)
    descricao: str | None = None
    tipo: TipoConvenio | None = None
    origem: str | None = None
    valor: Decimal | None = None
    status: StatusConvenio | None = None
    template_fluxo_id: uuid.UUID | None = None


class ProtocoloRequest(BaseModel):
    numero_protocolo: str = Field(..., max_length=100)
    data_protocolo: datetime | None = None


class ConvenioOut(BaseModel):
    id: uuid.UUID
    titulo: str
    descricao: str | None
    tipo: TipoConvenio
    origem: str | None
    numero_protocolo_governo: str | None
    valor: Decimal | None
    status: StatusConvenio
    data_protocolo: datetime | None
    responsavel_id: uuid.UUID
    template_fluxo_id: uuid.UUID | None
    etapas: list["EtapaOut"] = []
    anexos: list["AnexoOut"] = []
    tarefas: list["TarefaListItem"] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConvenioListItem(BaseModel):
    id: uuid.UUID
    titulo: str
    tipo: TipoConvenio
    origem: str | None = None
    numero_protocolo_governo: str | None = None
    valor: Decimal | None = None
    status: StatusConvenio
    etapa_atual: str | None = None
    proximo_prazo: datetime | None = None
    responsavel_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
