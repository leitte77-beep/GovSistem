import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AuditoriaOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID | None
    user_id: uuid.UUID | None
    convenio_id: uuid.UUID | None
    acao: str
    entidade: str | None
    entidade_id: uuid.UUID | None
    dados_anteriores: dict | None
    dados_posteriores: dict | None
    ip: str | None
    user_agent: str | None
    ocorrido_em: datetime

    model_config = {"from_attributes": True}
