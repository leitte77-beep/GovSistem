import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

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
    from app.models.case_file import CaseFile


class Attendance(Base, TimestampMixin, SoftDeleteMixin):
    """Atendimento registrado num prontuário. A evolução técnica é sensível."""

    __tablename__ = "attendances"
    __table_args__ = (
        Index("ix_attendances_tenant_casefile", "tenant_id", "case_file_id"),
        Index("ix_attendances_tenant_data", "tenant_id", "data_atendimento"),
        Index("ix_attendances_tenant_unit", "tenant_id", "unit_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    case_file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("case_files.id", ondelete="CASCADE"),
        nullable=False,
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("units.id", ondelete="CASCADE"),
        nullable=False,
    )
    service_type_code: Mapped[str] = mapped_column(String(40), nullable=False)

    data_atendimento: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)

    # Evolução técnica — dado sensível, criptografado em repouso.
    evolution_text_enc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Sigilo reforçado: restringe a leitura, dentro da unidade, a quem registrou
    # e ao coordenador da unidade.
    sigiloso_reforcado: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    registrado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )
    registrado_por_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    case_file: Mapped["CaseFile"] = relationship(
        "CaseFile", back_populates="attendances"
    )
    members: Mapped[List["AttendanceMember"]] = relationship(
        "AttendanceMember",
        back_populates="attendance",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    professionals: Mapped[List["AttendanceProfessional"]] = relationship(
        "AttendanceProfessional",
        back_populates="attendance",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Attendance {self.tipo} {self.data_atendimento}>"


class AttendanceMember(Base, TimestampMixin):
    """Membros da família atendidos num atendimento (N:N)."""

    __tablename__ = "attendance_members"
    __table_args__ = (
        Index("ix_att_members_tenant_att", "tenant_id", "attendance_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attendance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("attendances.id", ondelete="CASCADE"),
        nullable=False,
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="CASCADE"),
        nullable=False,
    )

    attendance: Mapped["Attendance"] = relationship(
        "Attendance", back_populates="members"
    )


class AttendanceProfessional(Base, TimestampMixin):
    """Profissionais que realizaram o atendimento (N:N)."""

    __tablename__ = "attendance_professionals"
    __table_args__ = (
        Index("ix_att_profs_tenant_att", "tenant_id", "attendance_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attendance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("attendances.id", ondelete="CASCADE"),
        nullable=False,
    )
    professional_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="CASCADE"),
        nullable=False,
    )

    attendance: Mapped["Attendance"] = relationship(
        "Attendance", back_populates="professionals"
    )
