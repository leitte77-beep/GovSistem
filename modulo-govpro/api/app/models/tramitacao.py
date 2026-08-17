import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin
from app.models.enums import TipoTramitacao


class Tramitacao(Base, TimestampMixin, TenantMixin):
    """Envio do processo a uma unidade (tramitação é múltipla e simultânea)."""

    __tablename__ = "tramitacoes"
    __table_args__ = (Index("ix_tramitacoes_tenant_processo", "tenant_id", "processo_id"),)

    processo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("processos.id", ondelete="CASCADE"),
        nullable=False,
    )
    unidade_origem_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("unidades.id", ondelete="SET NULL"),
        nullable=True,
    )
    unidade_destino_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("unidades.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo: Mapped[str] = mapped_column(
        String(20), default=TipoTramitacao.ENVIO.value, nullable=False
    )
    prazo_dias: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    observacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    criado_por_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    recebida: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recebida_em: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    def __repr__(self) -> str:
        return f"<Tramitacao p={self.processo_id} -> {self.unidade_destino_id}>"
