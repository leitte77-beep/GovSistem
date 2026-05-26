import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.user_role import UserRole


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"

    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    cpf: Mapped[Optional[str]] = mapped_column(
        String(11), unique=True, nullable=True
    )
    password_hash: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    mfa_secret: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Encrypted TOTP secret"
    )
    mfa_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(
        nullable=True
    )
    password_failures: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    locked_until: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    organization: Mapped[Optional["Organization"]] = relationship(
        "Organization", back_populates="users"
    )
    user_roles: Mapped[List["UserRole"]] = relationship(
        "UserRole", back_populates="user", lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<User {self.email}>"
