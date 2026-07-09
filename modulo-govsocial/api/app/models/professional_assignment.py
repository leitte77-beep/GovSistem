import uuid
from datetime import date
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.professional import Professional


class ProfessionalAssignment(Base, TimestampMixin):
    """Lotação de um profissional numa unidade, com histórico (data_inicio/fim)."""

    __tablename__ = "professional_assignments"
    __table_args__ = (
        Index("ix_assignments_tenant_prof", "tenant_id", "professional_id"),
        Index("ix_assignments_tenant_unit", "tenant_id", "unit_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    professional_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="CASCADE"),
        nullable=False,
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("units.id", ondelete="CASCADE"),
        nullable=False,
    )
    funcao_no_local: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    data_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    data_fim: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    professional: Mapped["Professional"] = relationship(
        "Professional", back_populates="assignments"
    )

    @property
    def is_current(self) -> bool:
        return self.data_fim is None

    def __repr__(self) -> str:
        return f"<Assignment prof={self.professional_id} unit={self.unit_id}>"
