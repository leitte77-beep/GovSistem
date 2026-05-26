import uuid
from typing import TYPE_CHECKING, Optional
from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin
from app.models.enums import AttachmentType

if TYPE_CHECKING:
    from app.models.file import File
    from app.models.matter import Matter

class MatterAttachment(Base, TimestampMixin):
    __tablename__ = "matter_attachments"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    matter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("matters.id", ondelete="CASCADE"), nullable=False, index=True)
    file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("files.id", ondelete="CASCADE"), nullable=False)
    attachment_type: Mapped[AttachmentType] = mapped_column(String(20), default=AttachmentType.ANNEX, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    matter: Mapped["Matter"] = relationship("Matter", back_populates="attachments")
    file: Mapped["File"] = relationship("File")
