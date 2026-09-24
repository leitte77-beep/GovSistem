import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.organization import Organization


class Plan(Base, TimestampMixin):
    """Service plan with feature limits for organizations."""

    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    max_users: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    max_editions_per_month: Mapped[int] = mapped_column(
        Integer, default=10, nullable=False
    )
    max_storage_mb: Mapped[int] = mapped_column(
        Integer, default=500, nullable=False
    )
    has_custom_domain: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    has_white_label: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    price_cents: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False,
        comment="Price in cents (R$). 0 = free.",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    organizations: Mapped[List["Organization"]] = relationship(
        "Organization", back_populates="plan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Plan {self.slug}>"
