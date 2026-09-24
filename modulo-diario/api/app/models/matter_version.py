import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import JSONB, Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.matter import Matter
    from app.models.organization import Organization
    from app.models.user import User


class MatterVersion(Base, TimestampMixin):
    """Immutable snapshot of a matter at a point in time.

    A new version is created only on meaningful events (meaningful autosave,
    submit, request-changes return, approval, lock for composition). Version
    ``version_number`` increments monotonically per matter. ``content_hash``
    guards integrity; the hash of each version differs when content changes.
    """

    __tablename__ = "matter_versions"

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
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    canonical_content: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True,
        comment="Canonical content snapshot (semantic blocks or content_json)",
    )
    rendered_html: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        comment="Rendered matter HTML at that version",
    )
    content_hash: Mapped[str] = mapped_column(
        String(64), nullable=False,
        comment="SHA-256 of the canonical content at that version",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    change_reason: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True,
        comment="Reason/event label, e.g. autosave, submit, review_return, approve",
    )
    source: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True,
        comment="source of the version: server_autosave, explicit_save, workflow_event",
    )
    matter_status: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True,
        comment="Matter status when this version was captured",
    )

    matter: Mapped["Matter"] = relationship(
        "Matter", back_populates="versions"
    )
    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="matter_versions"
    )
    created_by_user: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[created_by]
    )

    def __repr__(self) -> str:
        return f"<MatterVersion matter={self.matter_id} v{self.version_number}>"
