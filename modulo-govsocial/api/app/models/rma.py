import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class RmaFechamento(Base, TimestampMixin):
    """Fechamento mensal do RMA por unidade."""

    __tablename__ = "rma_fechamentos"
    __table_args__ = (
        UniqueConstraint("tenant_id", "unit_id", "ano", "mes", name="uq_rma_unit_ano_mes"),
        Index("ix_rma_tenant_unit", "tenant_id", "unit_id"),
        Index("ix_rma_tenant_status", "tenant_id", "status"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("units.id", ondelete="CASCADE"),
        nullable=False,
    )
    ano: Mapped[int] = mapped_column(Integer, nullable=False)
    mes: Mapped[int] = mapped_column(Integer, nullable=False)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="ABERTO",
        comment="ABERTO, FECHADO, REABERTO"
    )
    fechado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    fechado_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    reaberto_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    reaberto_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    motivo_reabertura: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    dados_calculados: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="JSON com todos os blocos calculados do formulário"
    )
    calculado_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    def __repr__(self) -> str:
        return f"<RmaFechamento {self.ano}/{self.mes} {self.status}>"


class RmaAjuste(Base, TimestampMixin):
    """Ajuste manual de um campo do RMA com justificativa auditada."""

    __tablename__ = "rma_ajustes"
    __table_args__ = (
        Index("ix_rma_ajuste_fechamento", "tenant_id", "fechamento_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    fechamento_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rma_fechamentos.id", ondelete="CASCADE"),
        nullable=False,
    )
    bloco: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="Código do bloco: CRAS_A, CRAS_C, CRAS_D, etc."
    )
    campo: Mapped[str] = mapped_column(String(100), nullable=False)
    valor_calculado: Mapped[int] = mapped_column(Integer, nullable=False)
    valor_ajustado: Mapped[int] = mapped_column(Integer, nullable=False)
    justificativa: Mapped[str] = mapped_column(Text, nullable=False)
    ajustado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
