"""Marcos do projeto (§213).

Um marco é um ponto de controle combinado ("convênio assinado", "50% da obra"),
diferente de etapa: a etapa diz em que fase o trabalho está; o marco diz se o
resultado esperado daquela fase foi atingido em data combinada.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import StatusMarco

if TYPE_CHECKING:
    from app.models.user import User


class DemandaMarco(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "demanda_marcos"
    __table_args__ = (
        Index("ix_demanda_marcos_org", "organization_id"),
        Index("ix_demanda_marcos_demanda", "demanda_id", "ordem"),
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
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[StatusMarco] = mapped_column(
        String(20), nullable=False, default=StatusMarco.PENDENTE
    )
    data_prevista: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    data_realizada: Mapped[Optional[datetime]] = mapped_column(
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
    def atrasado(self) -> bool:
        """Passou da data prevista e não foi realizado nem cancelado."""
        if self.status in (StatusMarco.CONCLUIDO, StatusMarco.CANCELADO):
            return False
        if self.data_prevista is None:
            return False
        return datetime.now(self.data_prevista.tzinfo) > self.data_prevista
