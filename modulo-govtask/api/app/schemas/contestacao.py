import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import StatusContestacao


class ContestacaoCreate(BaseModel):
    motivo: str = Field(..., min_length=10)
    novo_prazo_solicitado: datetime


class ContestacaoDecidir(BaseModel):
    aprovada: bool
    justificativa: str | None = None


class ContestacaoOut(BaseModel):
    id: uuid.UUID
    tarefa_id: uuid.UUID
    solicitado_por_id: uuid.UUID
    motivo: str
    novo_prazo_solicitado: datetime
    status: StatusContestacao
    decidido_por_id: uuid.UUID | None
    justificativa_decisao: str | None
    data_decisao: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
