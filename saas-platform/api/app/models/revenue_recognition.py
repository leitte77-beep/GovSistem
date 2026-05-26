import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class RevenueRecognitionSchedule(TimestampMixin, Base):
    __tablename__ = "revenue_recognition_schedules"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subscriptions.id", ondelete="CASCADE"),
        nullable=False,
    )
    invoice_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    total_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    recognized_amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    remaining_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    start_period: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    end_period: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    installments: Mapped[int] = mapped_column(Integer, default=1)
    recognized_installments: Mapped[int] = mapped_column(Integer, default=0)
    revenue_account_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    deferred_account_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), default="pending")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
