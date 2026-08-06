"""Documentos, versões, bloqueios e favoritos."""

import uuid
from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    ActorMixin,
    Base,
    ConcurrencyMixin,
    JSONType,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)
from app.models.enums import Classification, DocumentStatus, FileStatus, IndexStatus


class Document(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin, ConcurrencyMixin
):
    __tablename__ = "documents"
    __table_args__ = (
        Index("ix_documents_folder_name", "folder_id", "display_name"),
        Index("ix_documents_scope", "secretariat_id", "department_id"),
        Index("ix_documents_status_deleted", "status", "deleted_at"),
    )

    institution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    folder_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("folders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    secretariat_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("secretariats.id", ondelete="SET NULL"), nullable=True
    )
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )

    code: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(300), nullable=False, index=True)
    original_name: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    subject: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    process_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    protocol_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    contract_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    reference_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    document_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    expires_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)

    owner_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    author_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    stakeholder_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    classification: Mapped[str] = mapped_column(
        String(30), default=Classification.INTERNO.value, nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(40), default=DocumentStatus.APROVADO.value, nullable=False, index=True
    )
    retention_policy_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("retention_policies.id", ondelete="SET NULL"), nullable=True
    )
    legal_hold: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    inherit_permissions: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    current_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    current_version_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    mime_type: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, index=True)
    extension: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    file_status: Mapped[str] = mapped_column(
        String(30), default=FileStatus.PROCESSING.value, nullable=False, index=True
    )

    is_shortcut: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    shortcut_target_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("documents.id", ondelete="CASCADE"), nullable=True
    )

    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    download_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_accessed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    index_status: Mapped[str] = mapped_column(
        String(30), default=IndexStatus.PENDENTE.value, nullable=False, index=True
    )
    extracted_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    versions: Mapped[List["DocumentVersion"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        foreign_keys="DocumentVersion.document_id",
    )


class DocumentVersion(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "document_versions"
    __table_args__ = (
        UniqueConstraint("document_id", "version_number", name="uq_document_version"),
        Index("ix_versions_sha", "sha256"),
    )

    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(700), nullable=False)
    storage_bucket: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    original_name: Mapped[str] = mapped_column(String(300), nullable=False)
    extension: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    mime_type: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    change_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    file_status: Mapped[str] = mapped_column(
        String(30), default=FileStatus.PROCESSING.value, nullable=False
    )
    scan_result: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    restored_from_version: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    uploaded_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    document: Mapped["Document"] = relationship(
        back_populates="versions", foreign_keys=[document_id]
    )


class DocumentCustomField(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Valores dos campos personalizados definidos pela categoria."""

    __tablename__ = "document_custom_fields"
    __table_args__ = (UniqueConstraint("document_id", "field_id", name="uq_document_field"),)

    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("category_fields.id", ondelete="CASCADE"), nullable=False, index=True
    )
    value: Mapped[Optional[dict]] = mapped_column(JSONType, nullable=True)


class DocumentLock(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "document_locks"

    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False, unique=True, index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)


class Favorite(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "resource_type", "resource_id", name="uq_favorite"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    resource_type: Mapped[str] = mapped_column(String(30), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
