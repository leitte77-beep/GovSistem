import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.semantic.templates import (
    TEMPLATE_STATUS_ACTIVE,
    TEMPLATE_STATUS_DRAFT,
    TemplateConfig,
)

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.publication_template_version import PublicationTemplateVersion
    from app.models.user import User


class PublicationTemplate(Base, TimestampMixin):
    """A configurable, versioned visual template for an official act type.

    Active versions are immutable; editing requires creating a new version.
    """

    __tablename__ = "publication_templates"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    document_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="outro"
    )
    is_default: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), default=TEMPLATE_STATUS_DRAFT, nullable=False, index=True
    )
    active_version: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True,
        comment="Version number currently active (immutable)",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    organization: Mapped["Organization"] = relationship()
    creator: Mapped[Optional["User"]] = relationship()
    versions: Mapped[List["PublicationTemplateVersion"]] = relationship(
        "PublicationTemplateVersion", back_populates="template",
        lazy="selectin", order_by="PublicationTemplateVersion.version_number",
        cascade="all, delete-orphan",
    )

    def config_of_active_version(self) -> Optional[TemplateConfig]:
        if not self.active_version:
            return None
        for v in self.versions or []:
            if v.version_number == self.active_version:
                return TemplateConfig.model_validate(v.config_json)
        return None

    def __repr__(self) -> str:
        return f"<PublicationTemplate {self.slug} ({self.status})>"
