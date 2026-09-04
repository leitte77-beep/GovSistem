import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.matter import Matter
    from app.models.user import User


class MatterReview(Base, TimestampMixin):
    """Formal conference of a matter (original vs. diagrammed version).

    Records which version of the matter was reviewed. If the matter's content
    changes afterwards, the conference is auto-invalidated (``invalidated`` set
    and the version no longer matches), so an edition can never publish a
    matter version different from the one that was conferred.
    """

    __tablename__ = "matter_reviews"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matter_versions.id", ondelete="SET NULL"),
        nullable=True,
        comment="The MatterVersion that was conferred",
    )
    content_hash: Mapped[str] = mapped_column(
        String(64), nullable=False,
        comment="Hash of the content at conference time",
    )
    render_hash: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True,
        comment="Hash of the diagrammed rendering that was conferred",
    )
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    approved: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="active",
        comment="active | invalidated | superseded",
    )
    invalidated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Set when the matter content changed after the conference",
    )

    matter: Mapped["Matter"] = relationship(
        "Matter", back_populates="reviews"
    )
    reviewer: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[reviewed_by]
    )

    @property
    def is_valid(self) -> bool:
        return self.status == "active"

    def __repr__(self) -> str:
        return f"<MatterReview matter={self.matter_id} status={self.status}>"
