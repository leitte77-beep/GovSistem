"""Auditoria, notificações, comentários, aprovação, retenção, cotas e backup."""

import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
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
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)
from app.models.enums import (
    AuditResult,
    BackupStatus,
    BackupType,
    NotificationState,
    RestoreStatus,
)


class AuditLog(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Trilha de auditoria — imutável para usuários comuns (só INSERT via serviço)."""

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_resource", "resource_type", "resource_id"),
        Index("ix_audit_user_time", "user_id", "created_at"),
        Index("ix_audit_action_time", "action", "created_at"),
    )

    institution_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True, index=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    user_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    action: Mapped[str] = mapped_column(String(60), nullable=False)
    resource_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    resource_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    resource_name: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    secretariat_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True, index=True)
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True, index=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    result: Mapped[str] = mapped_column(
        String(20), default=AuditResult.SUCESSO.value, nullable=False
    )
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    data_before: Mapped[Optional[dict]] = mapped_column(JSONType, nullable=True)
    data_after: Mapped[Optional[dict]] = mapped_column(JSONType, nullable=True)
    correlation_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)


class Notification(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resource_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    resource_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    state: Mapped[str] = mapped_column(
        String(20), default=NotificationState.NAO_LIDA.value, nullable=False, index=True
    )
    dedupe_key: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, index=True)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class Comment(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin):
    __tablename__ = "comments"

    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("comments.id", ondelete="CASCADE"), nullable=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolved_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    edited_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    mentions: Mapped[List["CommentMention"]] = relationship(
        back_populates="comment", cascade="all, delete-orphan"
    )


class CommentMention(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "comment_mentions"

    comment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("comments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    comment: Mapped["Comment"] = relationship(back_populates="mentions")


class ApprovalFlow(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin):
    __tablename__ = "approval_flows"

    institution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    steps: Mapped[List["ApprovalStep"]] = relationship(
        back_populates="flow", cascade="all, delete-orphan", order_by="ApprovalStep.position"
    )


class ApprovalStep(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "approval_steps"

    flow_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("approval_flows.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    approver_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approver_profile: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    approver_department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )

    flow: Mapped["ApprovalFlow"] = relationship(back_populates="steps")


class ApprovalExecution(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "approval_executions"

    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    flow_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("approval_flows.id", ondelete="CASCADE"), nullable=False
    )
    step_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("approval_steps.id", ondelete="SET NULL"), nullable=True
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    decided_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    decided_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class RetentionPolicy(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin):
    __tablename__ = "retention_policies"

    institution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retain_days: Mapped[int] = mapped_column(Integer, nullable=False)
    block_delete_until_expiry: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    action_after: Mapped[str] = mapped_column(String(30), default="alertar", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class StorageQuota(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "storage_quotas"

    institution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    scope_type: Mapped[str] = mapped_column(String(30), nullable=False)
    scope_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True, index=True)
    limit_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    used_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    alert_percent: Mapped[float] = mapped_column(Float, default=80.0, nullable=False)
    last_alert_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)


class BackupJob(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    __tablename__ = "backup_jobs"

    institution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    backup_type: Mapped[str] = mapped_column(
        String(20), default=BackupType.FULL.value, nullable=False
    )
    schedule_cron: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    destination: Mapped[str] = mapped_column(String(500), nullable=False)
    include_database: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    include_files: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    retention_daily: Mapped[int] = mapped_column(Integer, default=7, nullable=False)
    retention_weekly: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    retention_monthly: Mapped[int] = mapped_column(Integer, default=12, nullable=False)
    encrypt: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    next_run_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    executions: Mapped[List["BackupExecution"]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )


class BackupExecution(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "backup_executions"

    job_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("backup_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    backup_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default=BackupStatus.AGENDADO.value, nullable=False, index=True
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    destination: Mapped[Optional[str]] = mapped_column(String(700), nullable=True)
    total_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    file_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    manifest_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    triggered_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verify_result: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    job: Mapped["BackupJob"] = relationship(back_populates="executions")


class RestoreJob(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "restore_jobs"

    execution_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("backup_executions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    scope: Mapped[str] = mapped_column(String(40), nullable=False)
    scope_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    conflict_strategy: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default=RestoreStatus.PLANEJADO.value, nullable=False
    )
    plan: Mapped[Optional[dict]] = mapped_column(JSONType, nullable=True)
    safety_point: Mapped[Optional[str]] = mapped_column(String(700), nullable=True)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    requested_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    restored_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class IntegrityCheck(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "integrity_checks"

    scope: Mapped[str] = mapped_column(String(40), nullable=False)
    execution_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("backup_executions.id", ondelete="CASCADE"), nullable=True, index=True
    )
    checked_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ok_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    missing_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    details: Mapped[Optional[dict]] = mapped_column(JSONType, nullable=True)
    triggered_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
