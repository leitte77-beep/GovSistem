import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base, TimestampMixin


class TaxRuleSet(TimestampMixin, Base):
    __tablename__ = "tax_rule_sets"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class TaxRuleVersion(TimestampMixin, Base):
    __tablename__ = "tax_rule_versions"

    rule_set_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tax_rule_sets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    valid_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    valid_to: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    tax_regime: Mapped[str] = mapped_column(String(30), nullable=False)
    service_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    city_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    iss_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ibs_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cbs_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cst: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    cclass_trib: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    ind_op: Mapped[Optional[str]] = mapped_column(String(4), nullable=True)
    source_reference: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    approved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rules: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
