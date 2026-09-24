import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.organization import Organization


class OrgUnit(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "org_units"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("org_units.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    abbreviation: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="org_units"
    )
    parent: Mapped[Optional["OrgUnit"]] = relationship(
        "OrgUnit", back_populates="children", remote_side="OrgUnit.id"
    )
    children: Mapped[List["OrgUnit"]] = relationship(
        "OrgUnit", back_populates="parent", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<OrgUnit {self.abbreviation or self.name}>"
