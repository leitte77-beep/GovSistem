import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base, TimestampMixin
from app.models.enums import PlanBillingCycle

if TYPE_CHECKING:
    from app.models.subscription import Subscription


class Plan(Base, TimestampMixin):
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    max_orgs: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    max_users: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    max_storage_gb: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    has_custom_domain: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_white_label: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_api_access: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_priority_support: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    allowed_modules: Mapped[Optional[list]] = mapped_column(
        JSON, nullable=True,
    )
    billing_cycle: Mapped[str] = mapped_column(
        String(20),
        default=PlanBillingCycle.MONTHLY.value,
        nullable=False,
    )
    price_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    setup_fee_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    trial_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_public: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
    )

    subscriptions: Mapped[List["Subscription"]] = relationship(
        "Subscription", back_populates="plan", lazy="selectin"
    )
