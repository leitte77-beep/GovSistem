"""Configuracao de canais de notificacao multicanal por tenant."""
import uuid

from sqlalchemy import Boolean, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base, TimestampMixin


class NotificationChannelConfig(Base, TimestampMixin):
    """Credenciais e parametros de um canal de notificacao (Email/WhatsApp/Push/SMS)."""

    __tablename__ = "notification_channel_configs"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    channel: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="EMAIL | WHATSAPP | PUSH | SMS",
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    config_json: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
        comment="Credenciais criptografadas especificas do canal (ex: smtp_host, fcm_key)",
    )
    label: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="Nome amigavel para identificacao na UI",
    )
