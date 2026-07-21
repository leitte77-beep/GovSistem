"""Schemas Pydantic para configuracao de canais de notificacao."""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class NotificationChannelCreate(BaseModel):
    channel: str = Field(..., max_length=20, description="EMAIL | WHATSAPP | PUSH | SMS")
    config_json: dict = Field(..., description="Credenciais do canal (serao criptografadas)")
    enabled: bool = True
    label: str | None = Field(None, max_length=100)


class NotificationChannelUpdate(BaseModel):
    config_json: dict | None = None
    enabled: bool | None = None
    label: str | None = Field(None, max_length=100)


class NotificationChannelOut(BaseModel):
    id: uuid.UUID
    channel: str
    enabled: bool
    label: str | None = None
    config_json: dict  # sem secrets — apenas chaves nao sensiveis expostas
    created_at: datetime
    updated_at: datetime


class NotificationChannelTest(BaseModel):
    channel_id: uuid.UUID | None = None
    channel: str | None = Field(
        None,
        description="EMAIL | WHATSAPP | PUSH | SMS — se nao informar channel_id",
    )
    destination: str = Field(..., description="Email, telefone ou device token")
    message: str = Field(default="Teste de notificacao GovSocial")
