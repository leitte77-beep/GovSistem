"""Usuários, grupos e sessões."""

import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    ActorMixin,
    Base,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)
from app.models.enums import Profile


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"

    institution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("institutions.id", ondelete="CASCADE", use_alter=True),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(200), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    profile: Mapped[str] = mapped_column(
        String(40), nullable=False, default=Profile.LEITOR.value, index=True
    )
    secretariat_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey("secretariats.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
        index=True,
    )
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey("departments.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
        index=True,
    )
    job_title: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    external_subject: Mapped[Optional[str]] = mapped_column(
        String(120), nullable=True, index=True,
        doc="ID do usuário na plataforma SaaS, quando o login vem de lá",
    )

    groups: Mapped[List["UserGroup"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def is_admin(self) -> bool:
        return self.profile == Profile.ADMIN_GERAL.value


class Group(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin):
    __tablename__ = "groups"

    institution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("institutions.id", ondelete="CASCADE", use_alter=True),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    members: Mapped[List["UserGroup"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )


class UserGroup(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "user_groups"
    __table_args__ = (UniqueConstraint("user_id", "group_id", name="uq_user_group"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True
    )

    user: Mapped["User"] = relationship(back_populates="groups")
    group: Mapped["Group"] = relationship(back_populates="members")


class RefreshToken(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Refresh token rotativo — guardamos apenas o hash."""

    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    replaced_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
