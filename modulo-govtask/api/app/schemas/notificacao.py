import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.enums import CanalNotificacao, TipoNotificacao


class NotificacaoOut(BaseModel):
    id: uuid.UUID
    destinatario_id: uuid.UUID
    tipo: TipoNotificacao
    convenio_id: uuid.UUID
    tarefa_id: uuid.UUID | None
    mensagem: str
    canal: CanalNotificacao
    lida: bool
    lida_em: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
