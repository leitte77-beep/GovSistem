import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ManifestoEntrada(Base, TimestampMixin):
    """NF-e de combustível detectada/importada e ainda não vinculada a um tanque.

    Representa o "manifesto pendente": a nota foi emitida contra o CNPJ do
    órgão (importada via XML ou lançada manualmente) mas a descarga no
    reservatório ainda não foi confirmada. Ao vincular, gera uma
    ``EntradaCombustivel`` e credita o estoque do tanque escolhido.
    """

    __tablename__ = "manifestos_entrada"
    __table_args__ = (
        Index("ix_manifestos_org_status", "organization_id", "status"),
        Index("ix_manifestos_org_chave", "organization_id", "chave_nfe"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chave_nfe: Mapped[Optional[str]] = mapped_column(String(44), nullable=True)
    numero: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    serie: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    emitente_nome: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    emitente_cnpj: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    data_emissao: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Item da nota (uma NF-e de combustível costuma ter um único item).
    combustivel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("combustiveis.id"), nullable=True
    )
    descricao_item: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    codigo_anp: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    quantidade_litros: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    valor_unitario: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 4), nullable=True)
    valor_total: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    # PENDENTE | VINCULADO | IGNORADO
    status: Mapped[str] = mapped_column(String(20), default="PENDENTE", nullable=False, index=True)
    # XML | MANUAL
    origem: Mapped[str] = mapped_column(String(30), default="MANUAL", nullable=False)
    entrada_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entradas_combustivel.id"), nullable=True
    )
    anexo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("anexos.id"), nullable=True
    )
    observacoes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
