import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

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


class PreferenciaNotificacaoOut(BaseModel):
    """Preferências de canal (§41).

    O in-app é sempre gravado; a tela só decide o e-mail. `tipos_obrigatorios`
    é informado para o usuário não achar que desmarcou algo que, por regra, sai
    de todo modo.
    """

    email_ativo: bool = False
    tipos_email: list[str] = Field(default_factory=list)
    tipos_disponiveis: list[str] = Field(default_factory=list)
    tipos_obrigatorios: list[str] = Field(default_factory=list)
    canal_configurado: bool = False


class PreferenciaNotificacaoUpdate(BaseModel):
    email_ativo: bool
    tipos_email: list[str] = Field(default_factory=list)
