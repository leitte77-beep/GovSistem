import hashlib
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import EditionStatus, EditionType

if TYPE_CHECKING:
    from app.models.edition_item import EditionItem
    from app.models.organization import Organization
    from app.models.signature import Signature
    from app.models.user import User


class Edition(Base, TimestampMixin):
    __tablename__ = "editions"
    __table_args__ = (
        UniqueConstraint("organization_id", "year", "number", "type",
                         name="uq_edition_org_year_number_type"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    type: Mapped[EditionType] = mapped_column(
        String(20), default=EditionType.NORMAL, nullable=False
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    subtitle: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    publication_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[EditionStatus] = mapped_column(
        String(20),
        default=EditionStatus.DRAFT,
        nullable=False,
        index=True,
    )
    pdf_path: Mapped[Optional[str]] = mapped_column(
        String(1000), nullable=True
    )
    signed_pdf_path: Mapped[Optional[str]] = mapped_column(
        String(1000), nullable=True,
        comment="Signed version (may be corrupted by signing service)",
    )
    pdf_hash: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True,
        comment="SHA-256 hex digest of the signed PDF",
    )
    verification_code: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True, unique=True
    )
    immutability_hash: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True,
        comment="SHA-256 of (edition content + ordered items + pdf_hash)",
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    published_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="editions"
    )
    publisher: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[published_by]
    )
    creator: Mapped["User"] = relationship(
        "User", foreign_keys=[created_by]
    )
    items: Mapped[List["EditionItem"]] = relationship(
        "EditionItem", back_populates="edition", lazy="selectin",
        cascade="all, delete-orphan",
        order_by="EditionItem.position",
    )
    signatures: Mapped[List["Signature"]] = relationship(
        "Signature", back_populates="edition", lazy="selectin",
    )

    def can_edit(self) -> bool:
        return EditionStatus.can_edit(self.status)

    def change_status(self, new_status: EditionStatus) -> None:
        EditionStatus(self.status).assert_transition(new_status)
        self.status = new_status

    def generate_verification_code(self) -> str:
        if self.verification_code:
            return self.verification_code
        raw = f"{self.id}{self.year}{self.number}"
        h = hashlib.sha256(raw.encode()).hexdigest()[:8].upper()
        self.verification_code = f"{self.year}{self.number:04d}-{h}"
        return self.verification_code

    def compute_immutability_hash(self) -> str:
        raw = f"{self.id}{self.year}{self.number}{self.pdf_hash}{self.verification_code}"
        return hashlib.sha256(raw.encode()).hexdigest()

    def __repr__(self) -> str:
        return f"<Edition {self.year}/{self.number}>"
