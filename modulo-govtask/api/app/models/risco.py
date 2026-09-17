"""Registro gerencial de riscos (§211).

Recurso simples de propósito: identifica o risco, estima probabilidade e
impacto, define mitigação e responsável. Não é matriz corporativa de riscos nem
ferramenta de auditoria — é o que o gestor precisa para não ser surpreendido.
"""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import NivelRisco, StatusRisco

if TYPE_CHECKING:
    from app.models.user import User


class DemandaRisco(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "demanda_riscos"
    __table_args__ = (
        CheckConstraint(
            "probabilidade BETWEEN 1 AND 5", name="ck_risco_probabilidade"
        ),
        CheckConstraint("impacto BETWEEN 1 AND 5", name="ck_risco_impacto"),
        Index("ix_demanda_riscos_org", "organization_id"),
        Index("ix_demanda_riscos_demanda", "demanda_id", "status"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    demanda_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("demandas.id", ondelete="CASCADE"),
        nullable=False,
    )
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    categoria: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    probabilidade: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    impacto: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    mitigacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[StatusRisco] = mapped_column(
        String(20), nullable=False, default=StatusRisco.IDENTIFICADO
    )
    previsao: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    resolvido_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    criado_por_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    responsavel: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[responsavel_id], lazy="selectin"
    )

    @property
    def score(self) -> int:
        """probabilidade × impacto, de 1 a 25."""
        return int(self.probabilidade) * int(self.impacto)

    @property
    def nivel(self) -> NivelRisco:
        """Faixa derivada do score. Transparente e determinística (§184)."""
        score = self.score
        if score >= 20:
            return NivelRisco.CRITICO
        if score >= 12:
            return NivelRisco.ALTO
        if score >= 6:
            return NivelRisco.MEDIO
        return NivelRisco.BAIXO
