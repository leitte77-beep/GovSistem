import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.edition import Edition
    from app.models.signing_credential import SigningCredential
    from app.models.user import User


class Signature(Base, TimestampMixin):
    __tablename__ = "signatures"

    edition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("editions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    signing_credential_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("signing_credentials.id", ondelete="RESTRICT"),
        nullable=False,
    )
    signed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    signature_data: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        comment="PAdES signature bytes (base64) or reference",
    )
    certificate_info: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True
    )
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    edition: Mapped["Edition"] = relationship(
        "Edition", back_populates="signatures"
    )
    user: Mapped["User"] = relationship("User")
    credential: Mapped["SigningCredential"] = relationship(
        "SigningCredential"
    )

    def __repr__(self) -> str:
        return f"<Signature edition={self.edition_id} user={self.user_id}>"
