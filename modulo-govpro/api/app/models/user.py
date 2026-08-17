import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.user_role import UserRole


class User(Base, TimestampMixin, SoftDeleteMixin):
    """Usuário interno (servidor/colaborador), autenticado via SSO do SaaS.

    Usuários SSO não têm senha local (`password_hash=None`); a autenticação é
    sempre delegada à plataforma (mesmo contrato do ChatGov). CPF é único POR
    tenant e nunca é chave exposta (LGPD).
    """

    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("organization_id", "cpf", name="uq_user_org_cpf"),)

    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    cpf: Mapped[Optional[str]] = mapped_column(
        String(11), nullable=True, comment="Somente dígitos; único por tenant"
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    password_failures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    organization: Mapped[Optional["Organization"]] = relationship(
        "Organization", back_populates="users"
    )
    user_roles: Mapped[List["UserRole"]] = relationship(
        "UserRole",
        back_populates="user",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<User {self.email}>"

    @property
    def managed_by_saas(self) -> bool:
        return self.password_hash is None
