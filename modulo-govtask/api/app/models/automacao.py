"""Regras configuráveis do motor de automações (§80–§81)."""

import uuid
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class Automacao(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "automacoes"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    gatilho: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    condicao: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    acoes: Mapped[list] = mapped_column(JSON, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    criado_por_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    criado_por = relationship("User")
    execucoes = relationship("AutomacaoExecucao", back_populates="automacao")


class AutomacaoExecucao(Base, TimestampMixin):
    """A trava de idempotência e a trilha de auditoria de uma regra."""
    __tablename__ = "automacao_execucoes"
    __table_args__ = (
        UniqueConstraint("automacao_id", "evento_id", name="uq_automacao_evento"),
    )

    automacao_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("automacoes.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    evento_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("eventos_timeline.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    sucesso: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    resultado: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    erro: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    automacao = relationship("Automacao", back_populates="execucoes")
    evento = relationship("EventoTimeline")
