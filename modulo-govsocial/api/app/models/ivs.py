"""Indice de Vulnerabilidade Social (IVS) — Fase 3.6."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class IvsCriterio(Base, TimestampMixin):
    """Criterio configuavel para calculo do IVS (CXXXII)."""

    __tablename__ = "ivs_criterios"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    peso: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    formula: Mapped[str] = mapped_column(String(50), nullable=False, comment="renda_per_capita | nro_beneficios | nro_violencias | programas_sociais | nro_atendimentos")
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class IvsCalculo(Base, TimestampMixin):
    """Resultado do calculo de IVS para uma familia (CXXX-CXXXI)."""

    __tablename__ = "ivs_calculos"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    family_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    pontuacao: Mapped[float] = mapped_column(Float, nullable=False)
    nivel: Mapped[str] = mapped_column(String(20), nullable=False, comment="NAO_VULNERAVEL | MUITO_BAIXA | BAIXA | MEDIA | ALTA | MUITO_ALTA")
    automatico: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    alterado_por_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    justificativa: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    data_calculo: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
