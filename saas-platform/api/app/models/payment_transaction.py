import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PaymentTransaction(TimestampMixin, Base):
    __tablename__ = "payment_transactions"

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
    receivable_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    customer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    gateway: Mapped[str] = mapped_column(String(100), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(30), nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    gateway_fee_cents: Mapped[Optional[int]] = mapped_column(nullable=True)
    installments: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="created", index=True
    )
    authorization_code: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    nsu: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tid: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    external_id: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, index=True
    )
    card_brand: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    card_last_four: Mapped[Optional[str]] = mapped_column(String(4), nullable=True)
    card_token: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    authorized_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    captured_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    paid_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expected_settlement_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    actual_settlement_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    chargeback_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    refunded_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    refund_amount_cents: Mapped[Optional[int]] = mapped_column(nullable=True)
    extra_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    is_sandbox: Mapped[bool] = mapped_column(Boolean, default=True)
