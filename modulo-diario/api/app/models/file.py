import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.user import User


class File(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "files"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(255), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    storage_bucket: Mapped[str] = mapped_column(String(255), nullable=False)
    hash: Mapped[str] = mapped_column(
        String(64), nullable=False, comment="SHA-256 hex digest"
    )
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_temp: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Temporary files can be garbage collected",
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="files"
    )
    uploader: Mapped[Optional["User"]] = relationship("User")

    def __repr__(self) -> str:
        return f"<File {self.filename}>"
