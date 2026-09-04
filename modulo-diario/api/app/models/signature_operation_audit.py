import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class SignatureOperationAudit(Base, TimestampMixin):
    """Persistent audit trail for every signing operations.

    Unlike the in-memory ``_audit_log`` (lost on restart), this table records
    each signature operation durably. It NEVER stores PFX, passwords or
    private keys.
    """

    __tablename__ = "signature_operation_audits"

    operation_id: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True,
    )
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True,
    )
    edition_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True,
    )
    credential_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True,
    )
    provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    requested_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True,
    )
    requested_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    result: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    source_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    signed_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    certificate_serial: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    correlation_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    client_service: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<SignatureOperationAudit op={self.operation_id} result={self.result}>"
