import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.module import Module
    from app.models.organization_module import OrganizationModule
    from app.models.subscription import Subscription
    from app.models.user import User


class Organization(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True
    )
    cnpj: Mapped[Optional[str]] = mapped_column(String(18), unique=True, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    address_street: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    address_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    address_complement: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    address_neighborhood: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    address_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    address_state: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    address_zip: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    theme_config: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
    )
    public_url: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    users: Mapped[List["User"]] = relationship(
        "User", back_populates="organization", lazy="selectin"
    )
    subscriptions: Mapped[List["Subscription"]] = relationship(
        "Subscription", back_populates="organization", lazy="selectin"
    )
    modules: Mapped[List["OrganizationModule"]] = relationship(
        "OrganizationModule", back_populates="organization", lazy="selectin"
    )
