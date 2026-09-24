import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class TrustAnchors(Base, TimestampMixin):
    """Managed store of trusted ICP-Brasil (or ACT) certificate anchors.

    Avoids hardcoding certificates in code. This is the single source of
    truth for which roots the validator should trust.
    """

    __tablename__ = "trust_anchors"

    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="Scope; NULL = global/any tenant",
    )
    issuer: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    subject: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    serial: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    thumbprint: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    valid_from: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    valid_to: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    source: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True,
        comment="e.g. icp-brasil, act, manual",
    )
    pem: Mapped[str] = mapped_column(String(4096), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<TrustAnchor subject={self.subject} enabled={self.enabled}>"
