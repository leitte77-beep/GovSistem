import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PaymentProviderConfig(TimestampMixin, Base):
    __tablename__ = "payment_provider_configs"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="asaas")
    environment: Mapped[str] = mapped_column(String(20), nullable=False, default="sandbox")
    api_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    webhook_token_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    webhook_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    pix_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    boleto_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    credit_card_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    default_billing_type: Mapped[str] = mapped_column(String(20), nullable=False, default="UNDEFINED")
    wallet_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
