import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class UserModuleGrant(Base, TimestampMixin):
    """A single per-module role granted to a user.

    One row = "user X has role <role_name> inside module <module_slug>".
    Granting/revoking is a simple insert/delete. The SSO flow reads these
    rows to decide which roles to forward to each module.
    """

    __tablename__ = "user_module_grants"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "module_slug", "role_name", name="uq_user_module_role"
        ),
        Index("ix_grants_user_module", "user_id", "module_slug"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    module_slug: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    role_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    user: Mapped["User"] = relationship("User", back_populates="module_grants")
