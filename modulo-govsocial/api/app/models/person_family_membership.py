import uuid
from datetime import date
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.family import Family
    from app.models.person import Person


class PersonFamilyMembership(Base, TimestampMixin):
    """Vínculo pessoa↔família com histórico (pessoa pode mudar de família)."""

    __tablename__ = "person_family_memberships"
    __table_args__ = (
        Index("ix_membership_tenant_person", "tenant_id", "person_id"),
        Index("ix_membership_tenant_family", "tenant_id", "family_id"),
        Index("ix_membership_tenant_status", "tenant_id", "status"),
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
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    parentesco: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="ATIVO",
        comment="ATIVO | TRANSFERIDO | DESLIGADO",
    )
    data_entrada: Mapped[date] = mapped_column(Date, nullable=False)
    data_saida: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    motivo_saida: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    person: Mapped["Person"] = relationship(
        "Person", back_populates="memberships", foreign_keys=[person_id]
    )
    family: Mapped["Family"] = relationship(
        "Family", back_populates="memberships", foreign_keys=[family_id]
    )

    def __repr__(self) -> str:
        return f"<Membership person={self.person_id} family={self.family_id} {self.status}>"
