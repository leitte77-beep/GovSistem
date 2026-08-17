"""Classificação de sigilo (LAI art. 24/27-28): histórico append-only.

Cada ação (CLASSIFICAR / RECLASSIFICAR / DESCLASSIFICAR) gera um registro com
quem, quando, grau, prazo e justificativa. A desclassificação pode ser manual ou
automática (expiração do prazo / evento).
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin


class ClassificacaoSigilo(Base, TimestampMixin, TenantMixin):
    __tablename__ = "classificacoes_sigilo"
    __table_args__ = (Index("ix_class_sigilo_tenant_alvo", "tenant_id", "alvo_tipo", "alvo_id"),)

    alvo_tipo: Mapped[str] = mapped_column(
        String(20), nullable=False, comment="processo | documento"
    )
    alvo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    acao: Mapped[str] = mapped_column(
        String(20), nullable=False, comment="CLASSIFICAR | RECLASSIFICAR | DESCLASSIFICAR"
    )
    grau: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    hipotese_legal_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("hipoteses_legais.id", ondelete="SET NULL"),
        nullable=True,
    )
    prazo_anos: Mapped[Optional[int]] = mapped_column(nullable=True)
    expira_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    justificativa: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    autoridade_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<ClassificacaoSigilo {self.acao} {self.alvo_tipo}:{self.alvo_id}>"
