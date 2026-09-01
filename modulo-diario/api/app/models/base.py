import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB as _PGJSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


# Portable JSONB: PostgreSQL gets a real JSONB column; other dialects
# (e.g. SQLite in tests) get generic JSON so Base.metadata.create_all works.
JSONB = JSON().with_variant(_PGJSONB(), "postgresql")


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SoftDeleteMixin:
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
