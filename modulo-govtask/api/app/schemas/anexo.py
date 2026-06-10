import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.enums import TipoDocumento


class AnexoOut(BaseModel):
    id: uuid.UUID
    convenio_id: uuid.UUID
    etapa_id: uuid.UUID | None
    tarefa_id: uuid.UUID | None
    nome_arquivo: str
    tipo_documento: TipoDocumento
    storage_path: str
    tamanho_bytes: int
    versao: int
    enviado_por_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}
