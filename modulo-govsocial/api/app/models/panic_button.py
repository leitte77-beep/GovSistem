import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, Float, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class PanicButton(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "panic_buttons"
    __table_args__ = (
        Index("ix_panic_buttons_tenant_status", "tenant_id", "status"),
        Index("ix_panic_buttons_person", "tenant_id", "person_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="CASCADE"),
        nullable=False,
    )
    family_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="SET NULL"),
        nullable=True,
    )
    activated_at: Mapped[datetime] = mapped_column(
        nullable=False,
        comment="Momento exato da ativação do botão (UTC)",
    )
    location_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    location_lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    location_address: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True, comment="Endereço reverso ou informado"
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="ATIVO",
        comment="ATIVO | ATENDIDO | CANCELADO | FALSO_ALARME",
    )
    attended_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    attended_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    medida_protetiva_numero: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True, comment="Nº do processo/medida protetiva"
    )
    medida_protetiva_validade: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True, comment="Data de validade da medida protetiva"
    )
