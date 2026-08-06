import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class NfseDocument(TimestampMixin, Base):
    __tablename__ = "nfse_documents"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invoice_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="SET NULL"),
        nullable=True,
    )
    customer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    provider: Mapped[str] = mapped_column(String(100), nullable=False, default="sandbox")
    environment: Mapped[str] = mapped_column(String(20), nullable=False, default="sandbox")

    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="draft", index=True
    )

    rps_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    nfse_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    verification_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    access_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    service_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    service_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    gross_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    iss_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ibs_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cbs_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    net_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    issue_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    competence_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    xml_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pdf_content_base64: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    protocol: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    provider_payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    provider_response: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    tax_rule_snapshot: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
