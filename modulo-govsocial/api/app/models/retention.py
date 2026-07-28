import uuid

from sqlalchemy import (
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class RetentionPolicy(Base, TimestampMixin):
    """Política de retenção/anomização por categoria de dado (LGPD art. 15-16)."""

    __tablename__ = "retention_policies"
    __table_args__ = (
        Index("ix_retpol_tenant", "tenant_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    categoria: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="ATENDIMENTOS | BENEFICIOS | PRONTUARIOS | ACOMPANHAMENTOS | AUDITORIA"
    )
    retencao_dias: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1825,
        comment="Dias de retenção antes da anonimização (default 5 anos)"
    )
    acao: Mapped[str] = mapped_column(
        String(20), nullable=False, default="ANONIMIZAR",
        comment="ANONIMIZAR | EXPURGAR"
    )
    base_legal: Mapped[str] = mapped_column(
        String(255), nullable=False,
        default="LGPD art. 16, I — cumprimento de obrigação legal",
    )
    ativo: Mapped[bool] = mapped_column(default=True, nullable=False)
