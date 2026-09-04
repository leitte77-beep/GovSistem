import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import JSONB, Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.integration_client import IntegrationClient


class IntegrationIdempotencyKey(Base, TimestampMixin):
    """Prevents duplicate matter creation when an integration retries.

    The caller supplies an ``Idempotency-Key`` header; the request body hash is
    stored alongside so a replayed request with the same key does not create a
    duplicate matter.
    """

    __tablename__ = "integration_idempotency_keys"

    integration_client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("integration_clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    request_hash: Mapped[str] = mapped_column(
        String(64), nullable=False,
        comment="SHA-256 of the normalized request body",
    )
    result_entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=True,
        comment="The matter/entity created, returned on replay",
    )
    response_json: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True,
        comment="Cached response returned verbatim on a replay",
    )

    client: Mapped["IntegrationClient"] = relationship(
        "IntegrationClient", back_populates="idempotency_keys"
    )

    def __repr__(self) -> str:
        return (
            f"<IntegrationIdempotencyKey client={self.integration_client_id} "
            f"key={self.idempotency_key}>"
        )
