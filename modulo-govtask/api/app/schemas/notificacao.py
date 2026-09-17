import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.enums import CanalNotificacao, TipoNotificacao


class NotificacaoOut(BaseModel):
    id: uuid.UUID
    destinatario_id: uuid.UUID
    tipo: TipoNotificacao
    # A notificação se prende a uma demanda (v2) **ou** a um convênio (entidades
    # anteriores); exigir o convênio quebrava toda notificação do núcleo novo.
    convenio_id: Optional[uuid.UUID] = None
    demanda_id: Optional[uuid.UUID] = None
    tarefa_id: uuid.UUID | None
    mensagem: str
    canal: CanalNotificacao
    lida: bool
    lida_em: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
