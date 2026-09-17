import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import StatusRepasse


class Repasse(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "repasses"

    convenio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("convenios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parcela: Mapped[int] = mapped_column(nullable=False, comment="Número da parcela")
    valor_previsto: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    valor_recebido: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    data_prevista: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    data_recebida: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    conta_destino: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    observacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[StatusRepasse] = mapped_column(
        String(20), nullable=False, default=StatusRepasse.PREVISTO
    )
    registrado_por_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    convenio = relationship("Convenio", back_populates="repasses")
    registrado_por = relationship("User", foreign_keys=[registrado_por_id])

    def __repr__(self) -> str:
        return f"<Repasse parcela {self.parcela} [{self.status.value}]>"
