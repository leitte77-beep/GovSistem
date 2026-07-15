"""Estoque completo — Insumos, Locais, Movimentacoes (Fase 3.11)."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, SoftDeleteMixin


class Insumo(Base, TimestampMixin, SoftDeleteMixin):
    """Insumo/produto do estoque (CLVIII)."""
    __tablename__ = "insumos"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    descricao: Mapped[str] = mapped_column(String(150), nullable=False)
    grupo_insumo_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    unidade_medida_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    fabricante: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    controla_lote: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    controla_validade: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class LocalEstoque(Base, TimestampMixin, SoftDeleteMixin):
    """Local fisico de armazenamento (CLXV)."""
    __tablename__ = "locais_estoque"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    unit_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("units.id", ondelete="CASCADE"), nullable=False)
    descricao: Mapped[str] = mapped_column(String(100), nullable=False)
    aceita_requisicao: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    mostra_saldo_requisicao: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class EstoqueSaldo(Base, TimestampMixin):
    """Saldo atual de insumo por local (substitui EstoqueUnidade existente)."""
    __tablename__ = "estoque_saldos"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    local_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("locais_estoque.id", ondelete="CASCADE"), nullable=False)
    insumo_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("insumos.id", ondelete="CASCADE"), nullable=False)
    quantidade: Mapped[float] = mapped_column(Numeric(12, 3), default=0, nullable=False)
    quantidade_minima: Mapped[float] = mapped_column(Numeric(12, 3), default=0, nullable=False)
    valor_unitario: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)


class MovimentacaoEstoque(Base, TimestampMixin):
    """Movimentacao de estoque (entrada/saida/transferencia/requisicao/devolucao) — CLXVIII."""
    __tablename__ = "movimentacoes_estoque"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, comment="ENTRADA | SAIDA | TRANSFERENCIA | REQUISICAO | DEVOLUCAO")
    local_origem_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), ForeignKey("locais_estoque.id", ondelete="SET NULL"), nullable=True)
    local_destino_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), ForeignKey("locais_estoque.id", ondelete="SET NULL"), nullable=True)
    fornecedor_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    data_movimentacao: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="CONCLUIDA", comment="PENDENTE | CONCLUIDA | CANCELADA")
    observacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    registrado_por_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)


class MovimentacaoItem(Base, TimestampMixin):
    """Itens de uma movimentacao (CLXXIII)."""
    __tablename__ = "movimentacao_itens"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    movimentacao_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("movimentacoes_estoque.id", ondelete="CASCADE"), nullable=False)
    insumo_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("insumos.id", ondelete="CASCADE"), nullable=False)
    lote: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    data_validade: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    quantidade: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False)
    valor_unitario: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
