import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.edition import Edition
    from app.models.matter import Matter


class EditionItem(Base, TimestampMixin):
    __tablename__ = "edition_items"

    edition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("editions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matters.id", ondelete="RESTRICT"),
        nullable=False,
    )
    section_title: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    page_number: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True,
        comment="Filled after PDF generation",
    )

    edition: Mapped["Edition"] = relationship(
        "Edition", back_populates="items"
    )
    matter: Mapped["Matter"] = relationship(
        "Matter", back_populates="edition_items"
    )

    def __repr__(self) -> str:
        return f"<EditionItem edition={self.edition_id} matter={self.matter_id}>"
