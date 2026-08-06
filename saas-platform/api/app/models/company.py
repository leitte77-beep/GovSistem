import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, StatusMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.organization import Organization


class Company(TimestampMixin, StatusMixin, Base):
    __tablename__ = "companies"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    trade_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cnpj: Mapped[Optional[str]] = mapped_column(String(18), unique=True, nullable=True, index=True)
    state_registration: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    municipal_registration: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    main_cnae: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    secondary_cnaes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tax_regime: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    simples_annex: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    fiscal_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fiscal_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    fiscal_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    fiscal_responsible: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    accountant_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    accountant_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    accountant_crc: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    has_digital_certificate: Mapped[bool] = mapped_column(Boolean, default=False)
    nfse_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    cbs_ibs_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    retention_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    cash_basis: Mapped[bool] = mapped_column(Boolean, default=True)
    config_effective_from: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    organization: Mapped["Organization"] = relationship("Organization")
