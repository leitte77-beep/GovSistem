import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.edition_publication_snapshot import EditionPublicationSnapshot


class PublicationArtifact(Base, TimestampMixin):
    """A generated, immutable artifact of an edition snapshot.

    Types: ``public_html``, ``source_pdf``, ``signed_pdf``. Artifacts are
    stored on their immutable storage path with their SHA-256 and size. The
    signed PDF is generated/signed ONCE; subsequent downloads return the same
    bytes — never regenerated.
    """

    __tablename__ = "publication_artifacts"

    snapshot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("edition_publication_snapshots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    artifact_type: Mapped[str] = mapped_column(
        String(30), nullable=False,
        comment="public_html | source_pdf | signed_pdf",
    )
    storage_path: Mapped[str] = mapped_column(
        String(1000), nullable=False,
        comment="Versioned storage path (immutable once written)",
    )
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(200), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    renderer: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True,
        comment="Renderer that produced the artifact",
    )
    renderer_version: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )
    validation_status: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True,
        comment="ok | invalid | not_validated",
    )
    is_preview: Mapped[bool] = mapped_column(
        default=False, nullable=False,
        comment="True for non-official preview artifacts",
    )

    snapshot: Mapped["EditionPublicationSnapshot"] = relationship()

    def __repr__(self) -> str:
        return f"<Artifact {self.artifact_type} {self.sha256[:8]}>"
