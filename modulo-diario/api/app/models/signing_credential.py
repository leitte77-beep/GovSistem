import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import SignatureProviderType

if TYPE_CHECKING:
    from app.models.organization import Organization


class SigningCredential(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "signing_credentials"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    provider_type: Mapped[SignatureProviderType] = mapped_column(
        String(20), nullable=False
    )
    config: Mapped[dict] = mapped_column(
        JSON, nullable=False, default=dict,
        comment="Encrypted provider-specific configuration",
    )
    certificate_serial: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    certificate_subject: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    certificate_issuer: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    valid_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="signing_credentials"
    )

    def __repr__(self) -> str:
        return f"<SigningCredential {self.label} ({self.provider_type})>"
