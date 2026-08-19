import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import StatusContrato, TipoAditivo

if TYPE_CHECKING:
    from app.models.convenio import Convenio
    from app.models.movimento_financeiro import MovimentoFinanceiro
    from app.models.user import User


class Contrato(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "contratos"

    convenio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("convenios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    numero: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    fornecedor: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cnpj: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    objeto: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    valor: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    data_assinatura: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    vigencia_inicio: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    vigencia_fim: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    fiscal_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    gestor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[StatusContrato] = mapped_column(
        String(20), nullable=False, default=StatusContrato.RASCUNHO
    )

    # Relationships
    convenio: Mapped["Convenio"] = relationship("Convenio", back_populates="contratos")
    fiscal: Mapped[Optional["User"]] = relationship("User", foreign_keys=[fiscal_id])
    gestor: Mapped[Optional["User"]] = relationship("User", foreign_keys=[gestor_id])
    aditivos: Mapped[list["Aditivo"]] = relationship(
        "Aditivo", back_populates="contrato", lazy="selectin",
        cascade="all, delete-orphan",
    )
    movimentos: Mapped[list["MovimentoFinanceiro"]] = relationship(
        "MovimentoFinanceiro", back_populates="contrato", lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Contrato {self.numero or self.id} [{self.status.value}]>"


class Aditivo(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "aditivos"

    contrato_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("contratos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    numero: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tipo: Mapped[TipoAditivo] = mapped_column(String(20), nullable=False, default=TipoAditivo.OUTRO)
    motivo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    valor: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    prazo: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    data: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    aprovado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    contrato: Mapped["Contrato"] = relationship("Contrato", back_populates="aditivos")
    aprovado_por: Mapped[Optional["User"]] = relationship("User", foreign_keys=[aprovado_por_id])

    def __repr__(self) -> str:
        return f"<Aditivo {self.numero or self.id} [{self.tipo.value}]>"
