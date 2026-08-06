import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, StatusMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.company import Company


class CompanyBranch(TimestampMixin, StatusMixin, Base):
    __tablename__ = "company_branches"

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    cnpj: Mapped[Optional[str]] = mapped_column(String(18), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    municipal_registration: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    state_registration: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_matrix: Mapped[bool] = mapped_column(Boolean, default=False)

    company: Mapped["Company"] = relationship("Company", backref="branches")
