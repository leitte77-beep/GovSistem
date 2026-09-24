"""Séries de numeração de atos por organização/tipo/ano.

Mantém um contador monotônico por (organização, tipo de ato, ano). O número é
atribuído de forma transacional (row lock) — nunca ``MAX+1`` sem proteção. O
contador nunca diminui, então números cancelados/não usados não são reutilizados
automaticamente; a rastreabilidade fica em auditoria (eventos com justificativa).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    UUID,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ActNumberSeries(Base):
    __tablename__ = "act_number_series"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "act_type_id",
            "year",
            name="uq_act_number_series_org_type_year",
        ),
        Index("ix_act_number_series_org", "organization_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    act_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("act_types.id", ondelete="RESTRICT"),
        nullable=False,
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    current: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ActNumberSeries {self.act_type_id}/{self.year} -> {self.current}>"
