import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.attendance import Attendance
    from app.models.family import Family
    from app.models.person import Person
    from app.models.professional import Professional
    from app.models.unit import Unit


class Appointment(Base, TimestampMixin, SoftDeleteMixin):
    """Agendamento por unidade/profissional/tipo."""

    __tablename__ = "appointments"
    __table_args__ = (
        Index("ix_appt_tenant_unit", "tenant_id", "unit_id"),
        Index("ix_appt_tenant_prof", "tenant_id", "professional_id"),
        Index("ix_appt_tenant_data", "tenant_id", "data_hora_inicio"),
        Index("ix_appt_tenant_status", "tenant_id", "status"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("units.id", ondelete="CASCADE"),
        nullable=False,
    )
    professional_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )
    person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="SET NULL"),
        nullable=True,
        comment="Cidadão agendado (opcional: pode ser walk-in)"
    )
    family_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="SET NULL"),
        nullable=True,
    )
    tipo: Mapped[str] = mapped_column(
        String(30), nullable=False, default="ATENDIMENTO"
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="AGENDADO"
    )
    data_hora_inicio: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    data_hora_fim: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    senha: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    lembrete_enviado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    opt_in_lembrete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    unit: Mapped["Unit"] = relationship("Unit")
    professional: Mapped[Optional["Professional"]] = relationship("Professional")
    person: Mapped[Optional["Person"]] = relationship("Person")
    family: Mapped[Optional["Family"]] = relationship("Family")

    def __repr__(self) -> str:
        return f"<Appointment {self.tipo} {self.status}>"


class VisitaDomiciliar(Base, TimestampMixin, SoftDeleteMixin):
    """Visita domiciliar planejada × realizada, vinculada a atendimento."""

    __tablename__ = "visitas_domiciliares"
    __table_args__ = (
        Index("ix_vd_tenant_family", "tenant_id", "family_id"),
        Index("ix_vd_tenant_prof", "tenant_id", "professional_id"),
        Index("ix_vd_tenant_status", "tenant_id", "status"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
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
    professional_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )
    attendance_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("attendances.id", ondelete="SET NULL"),
        nullable=True,
        comment="Atendimento vinculado à visita"
    )

    data_planejada: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    data_realizada: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PLANEJADA"
    )
    endereco_confirmado: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Endereço confirmado em campo"
    )
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    family: Mapped["Family"] = relationship("Family")
    unit: Mapped["Unit"] = relationship("Unit")
    professional: Mapped[Optional["Professional"]] = relationship("Professional")
    attendance: Mapped[Optional["Attendance"]] = relationship("Attendance")

    def __repr__(self) -> str:
        return f"<VisitaDomiciliar {self.status}>"
