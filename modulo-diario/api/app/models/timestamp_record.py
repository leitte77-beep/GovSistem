import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.edition import Edition
    from app.models.organization import Organization
    from app.models.signature import Signature


class TimestampRecord(Base, TimestampMixin):
    """Persistent record of an RFC 3161 time-stamping operation.

    The raw token may be stored in object storage; here we keep the metadata
    (and optionally the token reference) required to later prove the
    time-stamping of a signature/edition.
    """

    __tablename__ = "timestamp_records"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    edition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("editions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    signature_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("signatures.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="rfc3161")
    tsa_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    tsa_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    policy_oid: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    message_imprint_algorithm: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    message_imprint: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    gen_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    token: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        comment="RFC3161 token (raw bytes, base64) or reference to object storage",
    )
    token_ref: Mapped[Optional[str]] = mapped_column(
        String(1000), nullable=True,
        comment="Object storage path of the token, if stored separately",
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending_validation",
    )
    validation_status: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=False,
        default="pending_validation",
        comment="VALID | INVALID | INDETERMINATE | pending_validation",
    )
    validation_details: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    validated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="timestamp_records"
    )
    edition: Mapped["Edition"] = relationship(
        "Edition", back_populates="timestamp_records"
    )
    signature: Mapped[Optional["Signature"]] = relationship(
        "Signature", back_populates="timestamp_records"
    )

    def __repr__(self) -> str:
        return (
            f"<TimestampRecord edition={self.edition_id} "
            f"provider={self.provider} status={self.status}>"
        )
