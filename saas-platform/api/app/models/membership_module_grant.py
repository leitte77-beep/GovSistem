import uuid
from typing import TYPE_CHECKING, Optional

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
    from app.models.organization_membership import OrganizationMembership


class MembershipModuleGrant(Base, TimestampMixin, SoftDeleteMixin):
    """Grant de (membership, módulo, role).

    Um grant = "o vínculo do usuário com o tenant tem a role <role_name>
    dentro do módulo <module_slug>". Complementa/substitui aditivamente a
    tabela legada ``user_module_grants`` (que continua preservada).

    ``source`` indica a origem do grant:
        MIGRATED_GRANT  -> veio de user_module_grants
        MIGRATED_LEGACY -> veio de users.module_permissions (legado)
        TENANT_MANAGER  -> concedido pelo gestor do tenant
        PLATFORM_ADMIN  -> concedido pela plataforma
        SYSTEM          -> criado pelo sistema (ex.: admin padrão)
    """

    __tablename__ = "membership_module_grants"
    __table_args__ = (
        Index(
            "uq_membership_grant_module_role",
            "membership_id",
            "module_slug",
            "role_name",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_membership_grants_membership", "membership_id"),
        Index("ix_membership_grants_module", "module_slug"),
    )

    membership_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organization_memberships.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    module_slug: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    role_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    source: Mapped[str] = mapped_column(
        String(30), nullable=False, default="SYSTEM", index=True
    )
    requires_review: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    membership: Mapped["OrganizationMembership"] = relationship(
        "OrganizationMembership", back_populates="grants"
    )
