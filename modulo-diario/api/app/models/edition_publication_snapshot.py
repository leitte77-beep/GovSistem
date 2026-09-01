import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.edition import Edition
    from app.models.organization import Organization


class EditionPublicationSnapshot(Base, TimestampMixin):
    """Immutable frozen representation of a published edition.

    The snapshot is built once at close/publication. After freezing it must
    never change; mutations to source matters/templates must not affect it.
    ``content`` holds the full canonical manifest (matters + templates +
    assets + ordering) and ``content_manifest_hash`` guards its integrity.
    """

    __tablename__ = "edition_publication_snapshots"

    edition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("editions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content: Mapped[dict] = mapped_column(
        JSONB, nullable=False,
        comment="Frozen canonical manifest (matters + templates + assets)",
    )
    content_manifest_hash: Mapped[str] = mapped_column(
        String(64), nullable=False,
        comment="SHA-256 over canonical content manifest",
    )
    frozen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    frozen_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_valid: Mapped[bool] = mapped_column(
        default=True, nullable=False,
        comment="False if explicitly invalidated before signing",
    )

    edition: Mapped["Edition"] = relationship()
    organization: Mapped["Organization"] = relationship()

    def __repr__(self) -> str:
        return f"<Snapshot edition={self.edition_id} hash={self.content_manifest_hash[:8]}>"
