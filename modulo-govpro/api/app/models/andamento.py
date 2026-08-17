import uuid
from typing import Optional

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base, TenantMixin, TimestampMixin
from app.models.enums import TipoEvento


class Andamento(Base, TimestampMixin, TenantMixin):
    """Evento registrado na linha do tempo do processo (linguagem simples na área externa)."""

    __tablename__ = "andamentos"
    __table_args__ = (Index("ix_andamentos_tenant_processo", "tenant_id", "processo_id"),)

    processo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("processos.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo_evento: Mapped[str] = mapped_column(
        String(30), default=TipoEvento.OUTRO.value, nullable=False
    )
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    unidade_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("unidades.id", ondelete="SET NULL"),
        nullable=True,
    )
    usuario_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    dados: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    def __repr__(self) -> str:
        return f"<Andamento {self.tipo_evento} p={self.processo_id}>"
