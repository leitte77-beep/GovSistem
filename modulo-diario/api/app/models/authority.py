import uuid
from datetime import date
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Date, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.org_unit import OrgUnit
    from app.models.organization import Organization


class Authority(Base, TimestampMixin, SoftDeleteMixin):
    """Institutional registry of act signatories/responsibles (per tenant).

    A Matter keeps a denormalized snapshot of ``responsible_name`` /
    ``responsible_role`` copied here at save time, so documents stay correct
    even if this registry changes later. ``id`` is kept for provenance.
    """

    __tablename__ = "authorities"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    org_unit_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("org_units.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True,
        comment="Cargo/função (ex.: Prefeito Municipal)",
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    valid_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    valid_until: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    organization: Mapped[Optional["Organization"]] = relationship(
        "Organization", back_populates="authorities"
    )
    org_unit: Mapped[Optional["OrgUnit"]] = relationship("OrgUnit")

    def __repr__(self) -> str:
        return f"<Authority {self.name}>"
