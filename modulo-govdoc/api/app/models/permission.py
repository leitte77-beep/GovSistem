"""Entradas de permissão (modelo híbrido perfil + usuário + grupo + escopo)."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    ActorMixin,
    Base,
    JSONType,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)
from app.models.enums import PermissionEffect


class PermissionEntry(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Uma concessão (ou negativa) de permissões sobre um recurso.

    O cálculo da permissão efetiva fica em `app.services.permissions` — é o único
    lugar do sistema que decide acesso.
    """

    __tablename__ = "permission_entries"
    __table_args__ = (
        Index("ix_permission_resource", "resource_type", "resource_id"),
        Index("ix_permission_subject", "subject_type", "subject_id"),
    )

    institution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    resource_type: Mapped[str] = mapped_column(String(30), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)

    subject_type: Mapped[str] = mapped_column(String(30), nullable=False)
    subject_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    subject_profile: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)

    permissions: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    effect: Mapped[str] = mapped_column(
        String(10), default=PermissionEffect.ALLOW.value, nullable=False
    )
    apply_to_children: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
