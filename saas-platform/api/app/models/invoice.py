import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import InvoiceStatus

if TYPE_CHECKING:
    from app.models.subscription import Subscription


class Invoice(Base, TimestampMixin):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subscriptions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    invoice_number: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), default=InvoiceStatus.PENDING.value, nullable=False
    )
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    paid_amount_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    due_date: Mapped[datetime] = mapped_column(nullable=False)
    paid_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    payment_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    payment_gateway_id: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    period_start: Mapped[datetime] = mapped_column(nullable=False)
    period_end: Mapped[datetime] = mapped_column(nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payment_policy: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    fiscal_policy: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    subscription: Mapped["Subscription"] = relationship(
        "Subscription", back_populates="invoices"
    )
