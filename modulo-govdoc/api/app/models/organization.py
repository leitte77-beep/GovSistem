"""Hierarquia institucional: Instituição → Secretaria → Departamento/Setor."""

import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, BigInteger, DateTime, ForeignKey, String, Uuid, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    ActorMixin,
    Base,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)


class Institution(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin):
    __tablename__ = "institutions"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    cnpj: Mapped[Optional[str]] = mapped_column(String(18), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    primary_color: Mapped[str] = mapped_column(String(20), default="#1e40af")
    accent_color: Mapped[str] = mapped_column(String(20), default="#facc15")
    storage_limit_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    secretariats: Mapped[List["Secretariat"]] = relationship(
        back_populates="institution", cascade="all, delete-orphan"
    )


class Secretariat(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin):
    __tablename__ = "secretariats"
    __table_args__ = (UniqueConstraint("institution_id", "acronym", name="uq_secretariat_acronym"),)

    institution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    acronym: Mapped[str] = mapped_column(String(30), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    manager_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    manager_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    color: Mapped[str] = mapped_column(String(20), default="#1e40af")
    icon: Mapped[str] = mapped_column(String(40), default="building")
    storage_limit_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    institution: Mapped["Institution"] = relationship(back_populates="secretariats")
    departments: Mapped[List["Department"]] = relationship(
        back_populates="secretariat", cascade="all, delete-orphan",
        foreign_keys="Department.secretariat_id",
    )


class Department(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin):
    """Departamento ou setor, sempre vinculado a uma secretaria."""

    __tablename__ = "departments"

    institution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    secretariat_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("secretariats.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    acronym: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    manager_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )
    manager_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    storage_limit_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    secretariat: Mapped["Secretariat"] = relationship(
        back_populates="departments", foreign_keys=[secretariat_id]
    )
