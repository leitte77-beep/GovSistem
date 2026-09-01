import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.semantic.templates import TEMPLATE_STATUS_DRAFT

if TYPE_CHECKING:
    from app.models.publication_template import PublicationTemplate
    from app.models.user import User


class PublicationTemplateVersion(Base, TimestampMixin):
    """An immutable version of a publication template.

    ``config_json`` holds the validated TemplateConfig. ``config_hash`` is the
    SHA-256 of the canonical config; the asset snapshot is stored as JSON.
    """

    __tablename__ = "publication_template_versions"
    __table_args__ = (
        # one version per template
        __import__("sqlalchemy").UniqueConstraint(
            "template_id", "version_number", name="uq_tmpl_version_number"
        ),
    )

    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("publication_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default=TEMPLATE_STATUS_DRAFT, nullable=False
    )
    config_json: Mapped[dict] = mapped_column(
        JSONB, nullable=False,
        comment="Validated TemplateConfig as JSON (tokens + block rules)",
    )
    config_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    asset_snapshot: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True,
        comment="Local asset snapshot (brasão, fonts) — paths + hashes",
    )
    change_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    template: Mapped["PublicationTemplate"] = relationship(
        "PublicationTemplate", back_populates="versions"
    )
    creator: Mapped[Optional["User"]] = relationship()

    def __repr__(self) -> str:
        return f"<PublicationTemplateVersion v{self.version_number} ({self.status})>"
