import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class FiscalProfile(TimestampMixin, Base):
    __tablename__ = "fiscal_profiles"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tax_regime: Mapped[str] = mapped_column(String(30), nullable=False)
    cnae: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    municipal_registration: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    service_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    default_iss_aliquot: Mapped[Optional[float]] = mapped_column(nullable=True)
    iss_retained: Mapped[bool] = mapped_column(Boolean, default=False)
    tax_responsible: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_simples_nacional: Mapped[bool] = mapped_column(Boolean, default=False)
    is_mei: Mapped[bool] = mapped_column(Boolean, default=False)
    is_lucro_presumido: Mapped[bool] = mapped_column(Boolean, default=False)
    is_lucro_real: Mapped[bool] = mapped_column(Boolean, default=False)
    cbs_ibs_applicable: Mapped[bool] = mapped_column(Boolean, default=False)
    retention_rules: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    nfse_provider: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    nfse_emission_policy: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    environment: Mapped[str] = mapped_column(String(20), default="sandbox")
    digital_certificate_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    valid_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    valid_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    approved_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    normative_source: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
