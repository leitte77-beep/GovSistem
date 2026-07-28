import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    pass


class RepasseFinanceiro(Base, TimestampMixin, SoftDeleteMixin):
    """Repasses financeiros das 3 esferas (federal, estadual, municipal)."""

    __tablename__ = "repasse_financeiro"
    __table_args__ = (
        Index("ix_repasse_tenant", "tenant_id"),
        Index("ix_repasse_tenant_esfera", "tenant_id", "esfera"),
        Index("ix_repasse_tenant_status", "tenant_id", "status"),
        Index("ix_repasse_tenant_data", "tenant_id", "data_repasse"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    esfera: Mapped[str] = mapped_column(
        String(20), nullable=False,
        comment="FEDERAL | ESTADUAL | MUNICIPAL"
    )
    programa: Mapped[str] = mapped_column(
        String(255), nullable=False,
        comment="Nome do programa/convênio de repasse"
    )
    valor_total: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=0
    )
    valor_utilizado: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=0
    )
    data_repasse: Mapped[datetime] = mapped_column(
        Date, nullable=False
    )
    data_vigencia_inicio: Mapped[datetime] = mapped_column(
        Date, nullable=False
    )
    data_vigencia_fim: Mapped[Optional[datetime]] = mapped_column(
        Date, nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="ATIVO",
        comment="ATIVO | ENCERRADO | CANCELADO"
    )
    observacoes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )

    gastos: Mapped[list["GastoFinanceiro"]] = relationship(
        "GastoFinanceiro", back_populates="repasse", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<RepasseFinanceiro {self.programa} {self.esfera} R${self.valor_total}>"


class GastoFinanceiro(Base, TimestampMixin, SoftDeleteMixin):
    """Gastos vinculados a um repasse financeiro."""

    __tablename__ = "gasto_financeiro"
    __table_args__ = (
        Index("ix_gasto_tenant", "tenant_id"),
        Index("ix_gasto_tenant_repasse", "tenant_id", "repasse_id"),
        Index("ix_gasto_tenant_categoria", "tenant_id", "categoria"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    repasse_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("repasse_financeiro.id", ondelete="CASCADE"),
        nullable=False,
    )
    categoria: Mapped[str] = mapped_column(
        String(20), nullable=False,
        comment="BENEFICIO | PESSOAL | MATERIAL | SERVICO | OUTROS"
    )
    descricao: Mapped[str] = mapped_column(
        String(500), nullable=False
    )
    valor: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False
    )
    data_gasto: Mapped[datetime] = mapped_column(
        Date, nullable=False
    )
    comprovante_url: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )

    repasse: Mapped["RepasseFinanceiro"] = relationship(
        "RepasseFinanceiro", back_populates="gastos"
    )

    def __repr__(self) -> str:
        return f"<GastoFinanceiro {self.categoria} R${self.valor}>"
