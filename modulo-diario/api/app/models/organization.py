import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.edition import Edition
    from app.models.file import File
    from app.models.matter import Matter
    from app.models.org_unit import OrgUnit
    from app.models.plan import Plan
    from app.models.signing_credential import SigningCredential
    from app.models.tenant_domain import TenantDomain
    from app.models.user import User


class Organization(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    cnpj: Mapped[Optional[str]] = mapped_column(String(18), unique=True, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    theme_config: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="Theme customization: primary_color, secondary_color, font_family, etc.",
    )
    public_url: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True,
        comment="Default public portal URL for this organization",
    )
    pdf_layout: Mapped[str] = mapped_column(
        String(20), default="classico", nullable=False,
        comment="PDF layout template: classico, moderno, minimalista",
    )
    plan_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    plan: Mapped[Optional["Plan"]] = relationship(
        "Plan", back_populates="organizations", lazy="selectin"
    )
    org_units: Mapped[List["OrgUnit"]] = relationship(
        "OrgUnit", back_populates="organization", lazy="selectin"
    )
    users: Mapped[List["User"]] = relationship(
        "User", back_populates="organization", lazy="selectin"
    )
    matters: Mapped[List["Matter"]] = relationship(
        "Matter", back_populates="organization", lazy="selectin"
    )
    editions: Mapped[List["Edition"]] = relationship(
        "Edition", back_populates="organization", lazy="selectin"
    )
    files: Mapped[List["File"]] = relationship(
        "File", back_populates="organization", lazy="selectin"
    )
    signing_credentials: Mapped[List["SigningCredential"]] = relationship(
        "SigningCredential", back_populates="organization", lazy="selectin"
    )
    tenant_domains: Mapped[List["TenantDomain"]] = relationship(
        "TenantDomain", back_populates="organization", lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Organization {self.slug}>"
