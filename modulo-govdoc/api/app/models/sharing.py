"""Compartilhamento interno, links externos e solicitações externas de documentos."""

import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    ActorMixin,
    Base,
    JSONType,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)
from app.models.enums import ExternalRequestStatus, FileStatus


class InternalShare(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    __tablename__ = "internal_shares"
    __table_args__ = (Index("ix_share_resource", "resource_type", "resource_id"),)

    institution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    resource_type: Mapped[str] = mapped_column(String(30), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)

    target_type: Mapped[str] = mapped_column(String(30), nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)

    permissions: Mapped[list] = mapped_column(JSONType, nullable=False, default=list)
    starts_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notify: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    require_read_receipt: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class ExternalLink(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Link público. O token só existe em claro no momento da criação —
    no banco fica apenas o SHA-256."""

    __tablename__ = "external_links"

    institution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    token_prefix: Mapped[str] = mapped_column(String(12), nullable=False)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    allow_view: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_download: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_upload: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    max_accesses: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_downloads: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    access_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    download_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    require_name: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    require_email: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    require_phone: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    require_email_code: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    allowed_ips: Mapped[Optional[list]] = mapped_column(JSONType, nullable=True)
    watermark: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    terms_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    notify_on_access: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notify_on_download: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    items: Mapped[List["ExternalLinkItem"]] = relationship(
        back_populates="link", cascade="all, delete-orphan"
    )

    def is_active(self, now: datetime) -> bool:
        from app.core.timeutils import is_past

        if self.revoked_at is not None:
            return False
        if is_past(self.expires_at, now):
            return False
        if self.max_accesses is not None and self.access_count >= self.max_accesses:
            return False
        return True


class ExternalLinkItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "external_link_items"

    link_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("external_links.id", ondelete="CASCADE"), nullable=False, index=True
    )
    resource_type: Mapped[str] = mapped_column(String(30), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)

    link: Mapped["ExternalLink"] = relationship(back_populates="items")


class ExternalAccessLog(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "external_access_logs"

    link_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("external_links.id", ondelete="CASCADE"), nullable=True, index=True
    )
    request_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("external_upload_requests.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    document_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    visitor_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    visitor_email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    visitor_phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    result: Mapped[str] = mapped_column(String(30), nullable=False)
    detail: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)


class ExternalUploadRequest(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Link para RECEBER documentos de pessoas externas."""

    __tablename__ = "external_upload_requests"

    institution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    token_prefix: Mapped[str] = mapped_column(String(12), nullable=False)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    secretariat_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("secretariats.id", ondelete="SET NULL"), nullable=True
    )
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    target_folder_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("folders.id", ondelete="CASCADE"), nullable=False
    )

    allowed_extensions: Mapped[Optional[list]] = mapped_column(JSONType, nullable=True)
    max_file_size_mb: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    max_files: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    deadline: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    require_identification: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    require_email: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    require_email_code: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    terms_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    uploads: Mapped[List["ExternalUpload"]] = relationship(
        back_populates="request", cascade="all, delete-orphan"
    )


class ExternalUpload(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Arquivo recebido de fora — fica em quarentena até aprovação."""

    __tablename__ = "external_uploads"

    request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("external_upload_requests.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    original_name: Mapped[str] = mapped_column(String(300), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(700), nullable=False)
    mime_type: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    extension: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    sender_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sender_email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sender_phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    sender_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    file_status: Mapped[str] = mapped_column(
        String(30), default=FileStatus.QUARANTINE.value, nullable=False
    )
    scan_result: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), default=ExternalRequestStatus.RECEBIDO.value, nullable=False, index=True
    )
    review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    document_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )

    request: Mapped["ExternalUploadRequest"] = relationship(back_populates="uploads")
