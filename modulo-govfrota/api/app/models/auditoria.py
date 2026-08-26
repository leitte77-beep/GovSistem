import uuid
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Auditoria(Base, TimestampMixin):
    """Registro de auditoria — operações críticas do GovFrota."""

    __tablename__ = "auditorias"
    __table_args__ = (
        Index("ix_auditoria_org_data", "organization_id", "created_at"),
        Index("ix_auditoria_entidade", "entidade", "entidade_id"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    usuario_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    motorista_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    acao: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    entidade: Mapped[str] = mapped_column(String(60), nullable=False)
    entidade_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    dados_anteriores: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    dados_novos: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    justificativa: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)


class Notificacao(Base, TimestampMixin):
    """Notificações in-app de alertas (estoque mínimo, CNH vencendo, etc.)."""

    __tablename__ = "notificacoes"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tipo: Mapped[str] = mapped_column(String(40), nullable=False)
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    severidade: Mapped[str] = mapped_column(String(15), default="INFO", nullable=False)
    link: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    lida: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    lida_em: Mapped[Optional[DateTime]] = mapped_column(DateTime(timezone=True), nullable=True)
