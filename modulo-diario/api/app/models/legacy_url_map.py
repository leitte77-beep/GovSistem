import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.organization import Organization


class LegacyUrlMap(Base, TimestampMixin):
    """Maps a legacy/historical URL to its new canonical public path.

    Preserves SEO and keeps already-indexed public references working via a
    permanent redirect (301/308) on domains under the municipality's control.
    """

    __tablename__ = "legacy_url_maps"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    legacy_url: Mapped[str] = mapped_column(
        String(1000), nullable=False, index=True,
        comment="Original public URL (path or full URL) from the legacy archive",
        unique=True,
    )
    entity_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True,
    )
    new_path: Mapped[str] = mapped_column(
        String(1000), nullable=False,
        comment="New canonical path (e.g. /edicoes/2026/2517)",
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active",
        comment="active | disabled",
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="legacy_url_maps"
    )

    def __repr__(self) -> str:
        return f"<LegacyUrlMap {self.legacy_url} -> {self.new_path}>"
