"""Auditable record of an AI execution against the shared DeepSeek service.

Every AI operation (test, chat, and later model-authoring operations) writes a
row here for traceability: status, prompt version, model, latency, reported
usage and a sanitized error. Raw secrets are never stored. Raw prompts and
personal data are only referenced when permitted; this row keeps the metadata
needed to reason about cost and failures without keeping the model's internal
reasoning as a justification.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.models.base import Base, TimestampMixin
from app.models.enums import AiExecutionKind, AiExecutionStatus

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.user import User


class AiExecution(Base, TimestampMixin):
    __tablename__ = "ai_executions"
    __table_args__ = (
        Index("ix_ai_executions_org_kind_status", "organization_id", "kind", "status"),
        Index("ix_ai_executions_idempotency", "organization_id", "idempotency_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    kind: Mapped[AiExecutionKind] = mapped_column(String(40), nullable=False)
    status: Mapped[AiExecutionStatus] = mapped_column(String(20), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Sanitized request context (IDs/refs only, no secrets, no raw PII).
    request_meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Usage reported by the provider (prompt/completion/total tokens).
    usage: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Sanitized error (code + message). Never raw internal traces or secrets.
    error: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization: Mapped["Organization"] = relationship("Organization")
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<AiExecution {self.kind} {self.status} ({self.organization_id})>"
