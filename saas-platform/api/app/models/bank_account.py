import uuid
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, StatusMixin, TimestampMixin


class BankAccount(TimestampMixin, StatusMixin, Base):
    __tablename__ = "bank_accounts"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    bank_code: Mapped[str] = mapped_column(String(10), nullable=False)
    bank_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    agency: Mapped[str] = mapped_column(String(10), nullable=False)
    account_number: Mapped[str] = mapped_column(String(20), nullable=False)
    account_type: Mapped[str] = mapped_column(String(20), default="checking")
    holder_name: Mapped[str] = mapped_column(String(255), nullable=False)
    holder_doc: Mapped[Optional[str]] = mapped_column(String(18), nullable=True)
    pix_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    boleto_agreement: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    boleto_wallet: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    boleto_our_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    cnab_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    webhook_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    credentials: Mapped[Optional[Text]] = mapped_column(Text, nullable=True)
    environment: Mapped[str] = mapped_column(String(20), default="sandbox")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
