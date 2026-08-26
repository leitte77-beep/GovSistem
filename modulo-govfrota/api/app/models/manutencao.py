import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    BigInteger,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class Manutencao(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "manutencoes"
    __table_args__ = (
        Index("ix_manut_org_status", "organization_id", "status"),
        Index("ix_manut_org_veiculo_data", "organization_id", "veiculo_id", "data_solicitacao"),
        Index("ix_manut_veiculo", "veiculo_id"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    veiculo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("veiculos.id"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)  # PREVENTIVA/CORRETIVA/...
    descricao_problema: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    quilometragem: Mapped[Optional[int]] = mapped_column(BigInteger(), nullable=True)
    data_solicitacao: Mapped[date] = mapped_column(Date(), nullable=False)
    prioridade: Mapped[str] = mapped_column(String(15), default="NORMAL", nullable=False)
    oficina_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("oficinas.id"), nullable=True
    )
    fornecedor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fornecedores.id"), nullable=True
    )
    responsavel: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    previsao_conclusao: Mapped[Optional[date]] = mapped_column(Date(), nullable=True)
    data_conclusao: Mapped[Optional[date]] = mapped_column(Date(), nullable=True)
    valor_total: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="ABERTA", nullable=False)
    observacoes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    ocorrencia_origem_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    veiculo: Mapped["Veiculo"] = relationship()
    oficina: Mapped[Optional["Oficina"]] = relationship()
    itens: Mapped[list["ManutencaoItem"]] = relationship(
        back_populates="manutencao", cascade="all, delete-orphan"
    )


class ManutencaoItem(Base, TimestampMixin):
    """Custos da manutenção: serviço, peças, mão de obra, outros."""

    __tablename__ = "manutencoes_itens"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    manutencao_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("manutencoes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    categoria: Mapped[str] = mapped_column(String(30), default="SERVICO", nullable=False)
    descricao: Mapped[str] = mapped_column(String(300), nullable=False)
    quantidade: Mapped[int] = mapped_column(Integer(), default=1, nullable=False)
    valor_unitario: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    valor_total: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0, nullable=False)

    manutencao: Mapped["Manutencao"] = relationship(back_populates="itens")


class PlanoPreventivo(Base, TimestampMixin, SoftDeleteMixin):
    """Plano de manutenção preventiva por km / horímetro / data / meses."""

    __tablename__ = "planos_preventivos"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    veiculo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("veiculos.id"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(150), nullable=False)  # ex.: Troca de óleo
    base: Mapped[str] = mapped_column(String(20), nullable=False)  # BasePreventiva
    intervalo_km: Mapped[Optional[int]] = mapped_column(nullable=True)
    intervalo_horimetro: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 1), nullable=True)
    intervalo_meses: Mapped[Optional[int]] = mapped_column(nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)
    ultima_execucao_km: Mapped[Optional[int]] = mapped_column(BigInteger(), nullable=True)
    ultima_execucao_horimetro: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 1), nullable=True)
    ultima_execucao_data: Mapped[Optional[date]] = mapped_column(Date(), nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    veiculo: Mapped["Veiculo"] = relationship()
