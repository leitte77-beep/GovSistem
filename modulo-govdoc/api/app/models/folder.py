"""Pastas e subpastas.

`materialized_path` guarda a linhagem ("/<id-raiz>/<id-pai>/") e é o que permite
consultar descendentes com um único LIKE e detectar ciclos sem recursão.
"""

import uuid
from datetime import date
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    ActorMixin,
    Base,
    ConcurrencyMixin,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)
from app.models.enums import Classification


class Folder(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin, ConcurrencyMixin
):
    __tablename__ = "folders"
    __table_args__ = (
        Index("ix_folders_parent_name", "parent_id", "name"),
        Index("ix_folders_path", "materialized_path"),
    )

    institution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    secretariat_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("secretariats.id", ondelete="SET NULL"), nullable=True, index=True
    )
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("folders.id", ondelete="CASCADE"), nullable=True, index=True
    )
    materialized_path: Mapped[str] = mapped_column(String(2000), nullable=False, default="/")
    depth: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    color: Mapped[str] = mapped_column(String(20), default="#1e40af")
    icon: Mapped[str] = mapped_column(String(40), default="folder")
    classification: Mapped[str] = mapped_column(
        String(30), default=Classification.INTERNO.value, nullable=False, index=True
    )
    allow_external_share: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    inherit_permissions: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    retention_policy_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("retention_policies.id", ondelete="SET NULL"), nullable=True
    )
    expires_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    size_bytes_cache: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    parent: Mapped[Optional["Folder"]] = relationship(remote_side="Folder.id")

    def child_path(self) -> str:
        """Caminho materializado que os filhos desta pasta devem carregar."""
        return f"{self.materialized_path}{self.id}/"
