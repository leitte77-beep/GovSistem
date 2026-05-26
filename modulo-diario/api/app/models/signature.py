import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON
from app.models.base import Base, TimestampMixin
from app.models.edition import Edition

class Signature(Base, TimestampMixin):
    __tablename__ = "signatures"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    edition_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("editions.id", ondelete="CASCADE"), nullable=False, index=True)
    credential_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("signing_credentials.id", ondelete="SET NULL"), nullable=True)
    signed_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    signed_at: Mapped[datetime] = mapped_column(default=func.now(), nullable=False)
    provider_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    certificate_info: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    signature_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    edition: Mapped["Edition"] = relationship("Edition", back_populates="signatures")
