"""Credencial de acesso — permissão nominal para atuar em processo SIGILOSO."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin


class CredencialAcesso(Base, TimestampMixin, TenantMixin):
    __tablename__ = "credenciais_acesso"
    __table_args__ = (
        UniqueConstraint("processo_id", "usuario_id", name="uq_credencial_processo_usuario"),
        Index("ix_credenciais_tenant_usuario", "tenant_id", "usuario_id"),
    )

    processo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("processos.id", ondelete="CASCADE"),
        nullable=False,
    )
    usuario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    concedida_por_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    revogada_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    motivo: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    def __repr__(self) -> str:
        return f"<CredencialAcesso p={self.processo_id} u={self.usuario_id}>"
