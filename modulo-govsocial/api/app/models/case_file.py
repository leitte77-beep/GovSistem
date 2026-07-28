import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.attendance import Attendance
    from app.models.family import Family
    from app.models.unit import Unit


class CaseFile(Base, TimestampMixin, SoftDeleteMixin):
    """Prontuário de uma família POR unidade.

    PAIF (CRAS) e PAEFI (CREAS) são prontuários distintos — daí a chave
    (tenant, family, unit, service_type_code) ser única.
    """

    __tablename__ = "case_files"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "family_id", "unit_id", "service_type_code",
            name="uq_case_file_family_unit_service",
        ),
        Index("ix_case_files_tenant_family", "tenant_id", "family_id"),
        Index("ix_case_files_tenant_unit", "tenant_id", "unit_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("units.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Código do serviço da Tipificação (ex.: PAIF, PAEFI) — domínio por tenant.
    service_type_code: Mapped[str] = mapped_column(String(40), nullable=False)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="ATIVO"
    )

    # Acolhida inicial.
    acolhida_data: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    acolhida_access_form_code: Mapped[Optional[str]] = mapped_column(
        String(40), nullable=True, comment="Forma de acesso (domínio RMA)"
    )
    acolhida_motivo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    acolhida_profissional_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )
    aberto_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.utcnow()
    )

    family: Mapped["Family"] = relationship("Family")
    unit: Mapped["Unit"] = relationship("Unit")
    attendances: Mapped[List["Attendance"]] = relationship(
        "Attendance",
        back_populates="case_file",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<CaseFile {self.service_type_code} family={self.family_id}>"
