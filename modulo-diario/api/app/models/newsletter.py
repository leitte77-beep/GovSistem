"""Boletim por e-mail: inscritos do portal público e registro de envio por edição."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class NewsletterSubscriber(Base, TimestampMixin):
    """Inscrição com confirmação dupla (LGPD): só recebe depois de clicar no link.

    status: pending -> confirmed -> unsubscribed. O mesmo token serve para
    confirmar e para cancelar (vai em todo e-mail).
    """

    __tablename__ = "newsletter_subscribers"
    __table_args__ = (UniqueConstraint("organization_id", "email", name="uq_newsletter_org_email"),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    confirmation_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    unsubscribed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    consent_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class NewsletterDispatch(Base, TimestampMixin):
    """Um envio por edição: a unicidade impede mandar a mesma edição duas vezes."""

    __tablename__ = "newsletter_dispatches"

    edition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("editions.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    recipients: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
