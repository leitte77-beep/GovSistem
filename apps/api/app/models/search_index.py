import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Date, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SearchIndex(Base):
    """Full-text search index for published matters.

    Populated on edition publication. Prepares for future OpenSearch migration
    by keeping a flat, denormalized structure.
    """

    __tablename__ = "search_index"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matters.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    edition_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("editions.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    act_type: Mapped[str] = mapped_column(
        String(100), default="", nullable=False
    )
    org_unit: Mapped[str] = mapped_column(
        String(100), default="", nullable=False
    )
    plain_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    edition_number: Mapped[str] = mapped_column(
        String(20), default="", nullable=False
    )
    publication_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    search_vector: Mapped[Optional[str]] = mapped_column(
        TSVECTOR, nullable=True
    )

    __table_args__ = (
        Index("ix_search_index_vector", "search_vector", postgresql_using="gin"),
    )

    def __repr__(self) -> str:
        return f"<SearchIndex matter={self.matter_id}>"
