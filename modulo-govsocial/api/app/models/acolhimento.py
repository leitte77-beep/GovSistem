"""Acolhimento — Tipos: institucional, pernoite, republica, familia_acolhedora, calamidade (Fase 3.10)."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, SoftDeleteMixin


class Acolhimento(Base, TimestampMixin, SoftDeleteMixin):
    """Registro de acolhimento de pessoa/familia (CCXLIII-CCLIII)."""
    __tablename__ = "acolhimentos"
    __table_args__ = (
        {"info": {"indexes": [
            ("ix_acol_tenant", "tenant_id"),
            ("ix_acol_tenant_status", "tenant_id", "status"),
        ]}}
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    unit_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("units.id", ondelete="CASCADE"), nullable=False)
    person_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), ForeignKey("persons.id", ondelete="CASCADE"), nullable=True)
    family_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), ForeignKey("families.id", ondelete="CASCADE"), nullable=True)
    tipo: Mapped[str] = mapped_column(String(30), nullable=False, comment="INSTITUCIONAL | PERNOITE | REPUBLICA | FAMILIA_ACOLHEDORA | CALAMIDADE")
    publico: Mapped[Optional[str]] = mapped_column(String(30), nullable=True, comment="CRIANCA_ADOLESCENTE | ADULTO_FAMILIA | IDOSO | MULHER_VITIMA | JOVEM_DEFICIENTE")
    motivo_acolhimento_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    motivo_encerramento_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    instituicao: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    data_inicio: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    data_fim: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ATIVO", comment="ATIVO | ENCERRADO")
    reincidente: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    motivo_reincidencia: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    detalhamento: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    registrado_por_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)


class VagaAcolhimento(Base, TimestampMixin):
    """Controle de vagas de acolhimento por tipo (CCL)."""
    __tablename__ = "vagas_acolhimento"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    unit_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("units.id", ondelete="CASCADE"), nullable=False)
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    vagas_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    vagas_ocupadas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
