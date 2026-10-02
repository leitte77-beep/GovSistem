import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, text, DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class UsoVeiculo(Base, TimestampMixin):
    """Registro de uso (diário de bordo): saída e chegada com medição e foto do painel.

    `usa_horimetro` congela o tipo de medição do veículo no lançamento —
    `medicao_*` é km ou horas conforme ele.
    """

    __tablename__ = "usos_veiculo"
    __table_args__ = (
        Index("ix_uso_org_saida", "organization_id", "saida_em"),
        Index("ix_uso_org_status", "organization_id", "status"),
        Index("ix_uso_veiculo", "veiculo_id"),
        Index("ix_uso_motorista", "motorista_id"),
        # Um uso aberto por veículo e por motorista — garantido no banco, não só na API.
        Index("uq_uso_aberto_veiculo", "veiculo_id", unique=True,
              postgresql_where=text("status = 'EM_USO'"), sqlite_where=text("status = 'EM_USO'")),
        Index("uq_uso_aberto_motorista", "motorista_id", unique=True,
              postgresql_where=text("status = 'EM_USO'"), sqlite_where=text("status = 'EM_USO'")),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    veiculo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("veiculos.id"), nullable=False)
    motorista_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("motoristas.id"), nullable=False)
    # Secretaria do veículo no momento da saída (base do escopo e dos filtros).
    unidade_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("unidades.id"), nullable=True, index=True
    )
    finalidade: Mapped[str] = mapped_column(Text(), nullable=False)
    destino: Mapped[str] = mapped_column(String(255), nullable=False)
    usa_horimetro: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)

    saida_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    medicao_saida: Mapped[Decimal] = mapped_column(Numeric(14, 1), nullable=False)
    foto_saida_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    saida_latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6), nullable=True)
    saida_longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6), nullable=True)

    chegada_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    medicao_chegada: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 1), nullable=True)
    foto_chegada_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    chegada_latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6), nullable=True)
    chegada_longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6), nullable=True)

    # EM_USO | CONCLUIDO | ENCERRADO_GESTOR
    status: Mapped[str] = mapped_column(String(20), default="EM_USO", nullable=False)
    origem: Mapped[str] = mapped_column(String(20), default="APP_MOTORISTA", nullable=False)  # APP_MOTORISTA | PAINEL
    registrado_por_usuario_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    encerrado_por_usuario_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    motivo_encerramento: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # Avisos gravados (ex.: km de saída diferente do último conhecido) — nunca bloqueiam.
    alertas: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
