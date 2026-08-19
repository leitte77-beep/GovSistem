import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import TipoMovimento

if TYPE_CHECKING:
    from app.models.convenio import Convenio
    from app.models.medicao import Medicao
    from app.models.contrato import Contrato
    from app.models.user import User


class MovimentoFinanceiro(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "movimentos_financeiros"

    convenio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("convenios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tipo: Mapped[TipoMovimento] = mapped_column(String(30), nullable=False)
    numero: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True,
        comment="Número do empenho/liquidação/ordem de pagamento",
    )
    data: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    valor: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    favorecido: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    medicao_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("medicoes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    contrato_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("contratos.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    registro_por_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    # Relationships
    convenio: Mapped["Convenio"] = relationship("Convenio", back_populates="movimentos_financeiros")
    medicao: Mapped[Optional["Medicao"]] = relationship("Medicao", back_populates="movimentos_financeiros")
    contrato: Mapped[Optional["Contrato"]] = relationship("Contrato", back_populates="movimentos")
    registro_por: Mapped["User"] = relationship("User", foreign_keys=[registro_por_id])

    def __repr__(self) -> str:
        return f"<MovimentoFinanceiro {self.tipo.value} {self.valor}>"
