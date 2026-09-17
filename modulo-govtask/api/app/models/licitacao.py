import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import StatusLicitacao

if TYPE_CHECKING:
    from app.models.convenio import Convenio


class Licitacao(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "licitacoes"

    convenio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("convenios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    numero: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    modalidade: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    objeto: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    situacao: Mapped[StatusLicitacao] = mapped_column(
        String(30), nullable=False, default=StatusLicitacao.PREPARATORIA
    )
    valor_estimado: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    valor_contratado: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    vencedor: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cnpj_vencedor: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    data_disputa: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    data_homologacao: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    observacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    convenio: Mapped["Convenio"] = relationship("Convenio", back_populates="licitacoes")

    def __repr__(self) -> str:
        return f"<Licitacao {self.numero or self.id} [{self.situacao.value}]>"
