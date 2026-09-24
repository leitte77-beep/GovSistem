import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import BackupStatus, BackupType

if TYPE_CHECKING:
    from app.models.backup_config import BackupConfig


class BackupLog(Base, TimestampMixin):
    __tablename__ = "backup_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    config_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("backup_configs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    backup_type: Mapped[str] = mapped_column(
        String(20), default=BackupType.MANUAL.value, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), default=BackupStatus.RUNNING.value, nullable=False
    )
    file_path: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    started_at: Mapped[datetime] = mapped_column(default=func.now(), nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    triggered_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    config: Mapped["BackupConfig"] = relationship("BackupConfig", back_populates="logs")
