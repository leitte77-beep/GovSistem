import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON
from sqlalchemy.types import JSON

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.backup_log import BackupLog


class BackupConfig(Base, TimestampMixin):
    __tablename__ = "backup_configs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    cron_expression: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True,
    )
    retention_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    storage_type: Mapped[str] = mapped_column(
        String(50), default="s3", nullable=False,
    )
    storage_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    included_modules: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    encrypt: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notify_on_success: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notify_on_failure: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notification_emails: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    next_run_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    organization: Mapped["Organization"] = relationship("Organization")
    logs: Mapped[List["BackupLog"]] = relationship(
        "BackupLog", back_populates="config", lazy="selectin"
    )
