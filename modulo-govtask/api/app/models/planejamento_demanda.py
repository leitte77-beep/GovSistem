"""Configurações reutilizáveis da operação de Demandas (§82–84, §100–101)."""

import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Boolean, Date, ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class ModeloDemanda(Base, TimestampMixin, SoftDeleteMixin):
    """Molde administrativo; guarda apenas configuração, nunca histórico."""
    __tablename__ = "modelos_demanda"
    __table_args__ = (UniqueConstraint("organization_id", "nome", name="uq_modelo_demanda_org_nome"),)

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    configuracao: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    criado_por_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)


class RecorrenciaDemanda(Base, TimestampMixin):
    """Agenda que instancia uma demanda nova a partir de um modelo aprovado."""
    __tablename__ = "recorrencias_demanda"

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    modelo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("modelos_demanda.id", ondelete="RESTRICT"), nullable=False, index=True)
    periodicidade: Mapped[str] = mapped_column(String(15), nullable=False)  # MENSAL, TRIMESTRAL, ANUAL
    proxima_execucao: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    ativa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    criada_por_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    ultima_demanda_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("demandas.id", ondelete="SET NULL"), nullable=True)


class AusenciaSubstituicao(Base, TimestampMixin, SoftDeleteMixin):
    """Substitui somente novas atribuições durante o intervalo informado."""
    __tablename__ = "ausencias_substituicoes"

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    titular_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    substituto_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    inicio: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    fim: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    motivo: Mapped[str] = mapped_column(String(20), nullable=False)  # FERIAS, LICENCA, AFASTAMENTO
    observacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    criado_por_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
