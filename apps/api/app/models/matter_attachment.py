import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import AttachmentType

if TYPE_CHECKING:
    from app.models.file import File
    from app.models.matter import Matter


class MatterAttachment(Base, TimestampMixin):
    __tablename__ = "matter_attachments"

    matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("files.id", ondelete="RESTRICT"),
        nullable=False,
    )
    type: Mapped[AttachmentType] = mapped_column(
        String(20), default=AttachmentType.OTHER, nullable=False
    )
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    matter: Mapped["Matter"] = relationship(
        "Matter", back_populates="attachments"
    )
    file: Mapped["File"] = relationship("File")

    def __repr__(self) -> str:
        return f"<MatterAttachment {self.title or self.file_id}>"
