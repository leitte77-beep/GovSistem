import uuid
from typing import Optional
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin
from app.models.edition import Edition

class SigningDocument(Base, TimestampMixin):
    __tablename__ = "signing_documents"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    edition_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("editions.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    document_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    signed_path: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    edition: Mapped["Edition"] = relationship("Edition")
