import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.types import JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.organization import Organization


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"

    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    platform_role: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True,
    )
    mfa_secret: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    password_failures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    cpf: Mapped[Optional[str]] = mapped_column(String(11), unique=True, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    module_permissions: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    is_organization_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    organization: Mapped[Optional["Organization"]] = relationship(
        "Organization", back_populates="users"
    )
