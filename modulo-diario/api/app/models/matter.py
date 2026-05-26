import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base, TimestampMixin
from app.models.enums import MatterStatus

if TYPE_CHECKING:
    from app.models.act_type import ActType
    from app.models.edition_item import EditionItem
    from app.models.matter_attachment import MatterAttachment
    from app.models.org_unit import OrgUnit
    from app.models.organization import Organization
    from app.models.user import User


class Matter(Base, TimestampMixin):
    __tablename__ = "matters"

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
    act_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("act_types.id", ondelete="RESTRICT"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content_html: Mapped[str] = mapped_column(Text, nullable=False)
    content_json: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="Structured editor JSON (e.g. TipTap/ProseMirror)",
    )
    plain_text: Mapped[str] = mapped_column(
        Text, nullable=False,
        comment="Plain text extracted from content_html for search",
    )
    status: Mapped[MatterStatus] = mapped_column(
        String(20),
        default=MatterStatus.DRAFT,
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(
        nullable=True
    )
    previous_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matters.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_erratum: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    references_matter_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matters.id", ondelete="SET NULL"),
        nullable=True,
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="matters"
    )
    org_unit: Mapped[Optional["OrgUnit"]] = relationship("OrgUnit")
    act_type: Mapped["ActType"] = relationship("ActType")
    author: Mapped["User"] = relationship(
        "User", foreign_keys=[author_id]
    )
    reviewer: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[reviewed_by]
    )
    attachments: Mapped[List["MatterAttachment"]] = relationship(
        "MatterAttachment", back_populates="matter", lazy="selectin",
        cascade="all, delete-orphan",
    )
    edition_items: Mapped[List["EditionItem"]] = relationship(
        "EditionItem", back_populates="matter", lazy="selectin",
    )

    def can_edit(self) -> bool:
        return MatterStatus.can_edit(self.status)

    def change_status(self, new_status: MatterStatus) -> None:
        MatterStatus(self.status).assert_transition(new_status)
        self.status = new_status

    def __repr__(self) -> str:
        return f"<Matter {self.title[:50]}>"
