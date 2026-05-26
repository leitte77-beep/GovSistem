import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base, TimestampMixin


class CustomerDebt(TimestampMixin, Base):
    __tablename__ = "customer_debts"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    subscription_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    invoice_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    original_amount_cents: Mapped[int] = mapped_column(nullable=False)
    open_amount_cents: Mapped[int] = mapped_column(nullable=False)
    due_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="open", index=True
    )
    debt_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="overdue_invoice"
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    actions: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    last_action_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    settled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
