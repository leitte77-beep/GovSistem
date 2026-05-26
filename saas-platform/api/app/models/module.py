import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.organization_module import OrganizationModule


class Module(Base, TimestampMixin):
    __tablename__ = "modules"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)
    api_url: Mapped[str] = mapped_column(String(500), nullable=False)
    admin_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    public_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    version: Mapped[str] = mapped_column(String(20), default="1.0.0", nullable=False)
    settings_schema: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    org_modules: Mapped[List["OrganizationModule"]] = relationship(
        "OrganizationModule", back_populates="module", lazy="selectin"
    )
