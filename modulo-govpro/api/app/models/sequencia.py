import uuid

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin


class SequenciaNup(Base, TimestampMixin, TenantMixin):
    """Sequencial de NUP por unidade protocolizadora + ano (idempotente e concorrente)."""

    __tablename__ = "sequencias_nup"
    __table_args__ = (UniqueConstraint("unidade_id", "ano", name="uq_sequencia_unidade_ano"),)

    unidade_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("unidades.id", ondelete="CASCADE"),
        nullable=False,
    )
    ano: Mapped[int] = mapped_column(Integer, nullable=False)
    proximo: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    def __repr__(self) -> str:
        return f"<SequenciaNup u={self.unidade_id} ano={self.ano} prox={self.proximo}>"
