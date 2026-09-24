import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Index,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.membership_module_grant import MembershipModuleGrant
    from app.models.organization import Organization
    from app.models.user import User


class OrganizationMembership(Base, TimestampMixin, SoftDeleteMixin):
    """Vínculo de um usuário (identidade global) a um tenant (organização).

    É a fonte canônica do papel do usuário dentro de cada organização e do
    status do vínculo naquele tenant. Um usuário pode pertencer a vários
    tenants; o status/membership é independente por tenant.

    A antiga flag ``users.is_organization_admin`` é preservada durante a
    transição, mas a fonte canônica passa a ser ``membership_role``.
    """

    __tablename__ = "organization_memberships"
    __table_args__ = (
        Index(
            "uq_org_membership_org_user",
            "organization_id",
            "user_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_org_memberships_org", "organization_id"),
        Index("ix_org_memberships_user", "user_id"),
        Index("ix_org_memberships_org_status", "organization_id", "status"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    membership_role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="ORG_MEMBER", index=True
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="active", index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    position: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="memberships"
    )
    user: Mapped["User"] = relationship("User", back_populates="memberships")
    grants: Mapped[List["MembershipModuleGrant"]] = relationship(
        "MembershipModuleGrant",
        back_populates="membership",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
