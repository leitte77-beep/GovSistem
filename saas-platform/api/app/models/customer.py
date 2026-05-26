import uuid
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Customer(TimestampMixin, Base):
    __tablename__ = "customers"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    legal_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    doc_type: Mapped[str] = mapped_column(String(10), nullable=False, default="cpf")
    doc_number: Mapped[str] = mapped_column(String(18), nullable=False, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    billing_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    fiscal_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    zip_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    country: Mapped[str] = mapped_column(String(50), default="Brasil")
    is_taxpayer: Mapped[bool] = mapped_column(Boolean, default=True)
    customer_type: Mapped[str] = mapped_column(String(20), default="b2c")
    payment_preference: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    credit_limit_cents: Mapped[Optional[int]] = mapped_column(nullable=True)
    credit_limit_used_cents: Mapped[Optional[int]] = mapped_column(nullable=True, default=0)
    internal_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    deleted_at: Mapped[Optional[str]] = mapped_column(nullable=True)
