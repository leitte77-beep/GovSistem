"""Per-organization AI integration configuration.

Only one shared AI provider/model is used across the whole Diário Oficial
(DeepSeek ``deepseek-v4-flash``). The configuration is scoped to an
organization (tenant) — credentials and data are never shared between
organizations. The API key is stored encrypted-at-rest using the same versioned
Fernet key ring used for other secrets; the router must never expose the
plaintext key back to any client.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.organization import Organization


class AiConfig(Base, TimestampMixin):
    """Single AI configuration row per organization.

    ``organization_id`` is unique: exactly one config per tenant. ``model`` and
    ``provider`` are informative/read-only by contract; the effective model and
    endpoint always come from the server config so no tenant can silently point
    AI calls at an arbitrary destination.
    """

    __tablename__ = "ai_configs"
    __table_args__ = (
        # One configuration per organization.
        UniqueConstraint("organization_id", name="uq_ai_configs_organization_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="deepseek")
    model: Mapped[str] = mapped_column(String(100), nullable=False, default="deepseek-v4-flash")

    api_key_ciphertext: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Stores only a masked hint (e.g. ``****wxyz``), never the key.
    api_key_masked: Mapped[str | None] = mapped_column(String(16), nullable=True)

    timeout_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    max_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=4096)
    max_concurrency: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    # Optional monthly usage cap (in tokens). Null = unlimited (admin-managed).
    monthly_token_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Optional keyring/secret-provider reference when one is adopted (future).
    secret_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)

    last_test_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    last_test_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_test_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_test_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    usage_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    organization: Mapped["Organization"] = relationship("Organization", back_populates="ai_config")

    @property
    def has_api_key(self) -> bool:
        return bool(self.api_key_ciphertext)

    def usage_metadata(self) -> dict:
        """Computed metadata used to shape API responses (never the key)."""
        return {
            "configured": self.has_api_key,
            "key_masked": self.api_key_masked,
            "enabled": self.enabled,
            "provider": self.provider,
            "model": self.model,
            "timeout_seconds": self.timeout_seconds,
            "max_tokens": self.max_tokens,
            "max_concurrency": self.max_concurrency,
            "monthly_token_limit": self.monthly_token_limit,
            "usage_tokens": self.usage_tokens,
            "last_test_status": self.last_test_status,
            "last_test_at": self.last_test_at,
            "last_test_message": self.last_test_message,
            "last_test_latency_ms": self.last_test_latency_ms,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    def __repr__(self) -> str:  # pragma: no cover
        return f"<AiConfig org={self.organization_id} enabled={self.enabled}>"
