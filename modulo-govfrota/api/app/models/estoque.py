import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

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


class EntradaCombustivel(Base, TimestampMixin):
    """Compra/recebimento de combustível (entrada no tanque).

    Registros nunca são apagados fisicamente — use cancelamento auditável.
    """

    __tablename__ = "entradas_combustivel"
    __table_args__ = (
        Index("ix_entradas_org_data", "organization_id", "data_entrada"),
        Index("ix_entradas_org_tanque", "organization_id", "tanque_id"),
        Index("ix_entradas_org_cancelada", "organization_id", "cancelada"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tanque_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tanques.id"), nullable=False
    )
    combustivel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("combustiveis.id"), nullable=False
    )
    fornecedor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fornecedores.id"), nullable=True
    )
    quantidade_litros: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    data_entrada: Mapped[date] = mapped_column(Date(), nullable=False)
    numero_nota: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    serie_nota: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    chave_nfe: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    valor_total: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    valor_por_litro: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 4), nullable=True)
    responsavel_usuario_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    anexo_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    cancelada: Mapped[bool] = mapped_column(default=False, nullable=False)
    cancelada_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelada_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    motivo_cancelamento: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    tanque: Mapped["Tanque"] = relationship()
    combustivel: Mapped["Combustivel"] = relationship()
    fornecedor: Mapped[Optional["Fornecedor"]] = relationship()


class MovimentacaoEstoque(Base, TimestampMixin):
    """Movimentação de estoque de combustível — append-only.

    O estoque atual do tanque é derivado destas movimentações:
    estoque_inicial + entradas + ajustes_positivos - saidas(abastecimentos)
    - ajustes_negativos ± transferências ± estornos.
    """

    __tablename__ = "movimentacoes_estoque"
    __table_args__ = (
        Index("ix_movim_org_tanque_data", "organization_id", "tanque_destino_id", "created_at"),
        Index("ix_movim_origem_ref", "origem", "referencia_id"),
        Index("ix_movim_org_combustivel", "organization_id", "combustivel_id", "created_at"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)  # TipoMovimentacao
    origem: Mapped[str] = mapped_column(String(40), nullable=False)  # OrigemMovimentacao
    # Sinal da movimentação sobre o tanque_destino (+1 entrada / -1 saída)
    sinal: Mapped[int] = mapped_column(nullable=False)
    quantidade: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    combustivel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("combustiveis.id"), nullable=False
    )
    tanque_destino_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tanques.id"), nullable=False
    )
    tanque_origem_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tanques.id"), nullable=True
    )
    referencia_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    referencia_tipo: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    descricao: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    custo_unitario: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 4), nullable=True)
    responsavel_usuario_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    responsavel_motorista_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    saldo_apos: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)


class InventarioTanque(Base, TimestampMixin):
    """Conferência física de estoque do tanque (inventário)."""

    __tablename__ = "inventarios_tanque"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tanque_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tanques.id"), nullable=False
    )
    estoque_sistema: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    estoque_fisico: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    diferenca: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    data_conferencia: Mapped[date] = mapped_column(Date(), nullable=False)
    justificativa: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    ajuste_aplicado: Mapped[bool] = mapped_column(default=False, nullable=False)
    movimentacao_ajuste_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    usuario_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
