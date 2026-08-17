"""Versão pública de documento (tarja/ocultação parcial — LAI).

Mantém o original íntegro e vinculado; a versão tarjada é um componente alternativo
entregue quando o restante do documento é público.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin


class VersaoPublica(Base, TimestampMixin, TenantMixin):
    __tablename__ = "versoes_publicas"
    __table_args__ = (Index("ix_versoes_publicas_tenant_documento", "tenant_id", "documento_id"),)

    documento_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documentos.id", ondelete="CASCADE"),
        nullable=False,
    )
    componente_digital_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("componentes_digitais.id", ondelete="CASCADE"),
        nullable=False,
    )
    criado_por_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    motivo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expira_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<VersaoPublica doc={self.documento_id}>"
