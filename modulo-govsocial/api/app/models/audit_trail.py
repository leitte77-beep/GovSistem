import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base


class AuditTrail(Base):
    """Trilha de auditoria APPEND-ONLY (prova para órgão de controle).

    Não usa TimestampMixin (sem updated_at) nem SoftDelete: registros são
    imutáveis. Proteção contra UPDATE/DELETE é reforçada por trigger + revogação
    de permissões na migração (produção PostgreSQL).
    """

    __tablename__ = "audit_trail"
    __table_args__ = (
        Index("ix_audit_tenant_occurred", "tenant_id", "occurred_at"),
        Index("ix_audit_tenant_entity", "tenant_id", "entity", "entity_id"),
        Index("ix_audit_tenant_actor", "tenant_id", "actor_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    actor_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    actor_role: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    access_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="WRITE"
    )
    entity: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    origin: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    request_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    diff_summary: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    def __repr__(self) -> str:
        return f"<AuditTrail {self.action} {self.entity}:{self.entity_id}>"
