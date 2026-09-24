import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Coupon(TimestampMixin, Base):
    __tablename__ = "coupons"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    discount_type: Mapped[str] = mapped_column(String(10), nullable=False)
    discount_value_cents: Mapped[Optional[int]] = mapped_column(nullable=True)
    discount_percent: Mapped[Optional[float]] = mapped_column(nullable=True)
    max_uses: Mapped[Optional[int]] = mapped_column(nullable=True)
    current_uses: Mapped[int] = mapped_column(Integer, default=0)
    max_uses_per_customer: Mapped[Optional[int]] = mapped_column(nullable=True)
    applies_to_plan_ids: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    valid_from: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    valid_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    first_time_only: Mapped[bool] = mapped_column(Boolean, default=False)
    max_discount_cycles: Mapped[Optional[int]] = mapped_column(nullable=True)
