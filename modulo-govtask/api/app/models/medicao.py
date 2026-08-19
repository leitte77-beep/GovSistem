import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import StatusMedicao

if TYPE_CHECKING:
    from app.models.anexo import Anexo
    from app.models.convenio import Convenio
    from app.models.movimento_financeiro import MovimentoFinanceiro
    from app.models.user import User


class Medicao(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "medicoes"

    convenio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("convenios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    numero: Mapped[int] = mapped_column(nullable=False, comment="Número da medição")
    periodo_inicio: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    periodo_fim: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    data: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    valor: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    percentual: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 2), nullable=True, comment="Percentual desta medição"
    )
    percentual_acumulado: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 2), nullable=True, comment="Percentual acumulado da obra"
    )
    responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    observacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[StatusMedicao] = mapped_column(
        String(20), nullable=False, default=StatusMedicao.REGISTRADA
    )
    aprovada_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    data_aprovacao: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    convenio: Mapped["Convenio"] = relationship("Convenio", back_populates="medicoes")
    responsavel: Mapped[Optional["User"]] = relationship("User", foreign_keys=[responsavel_id])
    aprovada_por: Mapped[Optional["User"]] = relationship("User", foreign_keys=[aprovada_por_id])
    anexos: Mapped[list["Anexo"]] = relationship(
        "Anexo", back_populates="medicao", lazy="selectin",
        cascade="all, delete-orphan",
    )
    movimentos_financeiros: Mapped[list["MovimentoFinanceiro"]] = relationship(
        "MovimentoFinanceiro", back_populates="medicao", lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Medicao {self.numero} [{self.status.value}]>"
