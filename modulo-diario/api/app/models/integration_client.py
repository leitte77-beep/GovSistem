import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.integration_idempotency_key import IntegrationIdempotencyKey
    from app.models.organization import Organization


class IntegrationClient(Base, TimestampMixin, SoftDeleteMixin):
    """An external GovSistem system authorized to push matters via API.

    Holds a scoped API key. An integration is NEVER allowed to publish an
    edition directly; it may only create/submit matters that flow through the
    human editorial workflow.
    """

    __tablename__ = "integration_clients"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    client_id: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True,
    )
    hashed_api_key: Mapped[str] = mapped_column(
        String(128), nullable=False,
        comment="SHA-256 of the API key (never store plaintext)",
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    scopes: Mapped[dict] = mapped_column(
        JSON, nullable=False, default=dict,
        comment="Granted scopes as a list, e.g. ['matter:create', 'matter:read', 'matter:submit']",
    )
    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="integration_clients"
    )
    idempotency_keys: Mapped[List["IntegrationIdempotencyKey"]] = relationship(
        "IntegrationIdempotencyKey", back_populates="client",
        cascade="all, delete-orphan",
    )

    def has_scope(self, scope: str) -> bool:
        scopes = self.scopes.get("list") if isinstance(self.scopes, dict) else self.scopes
        if isinstance(scopes, list):
            return scope in scopes
        return bool(scopes and scope in scopes)

    def __repr__(self) -> str:
        return f"<IntegrationClient {self.client_id}>"
