import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base
from app.models.enums import ActorTipo


class AuditTrail(Base):
    """Trilha de auditoria APPEND-ONLY, encadeada por hash (light blockchain).

    - Sem UPDATE/DELETE (proteção por trigger + revogação de permissões).
    - `hash_registro = SHA256(hash_anterior || canonical(dados))` detecta adulteração.
    - Separada de logs de aplicação e de métricas.
    """

    __tablename__ = "audit_trail"
    __table_args__ = (
        Index("ix_audit_tenant_occurred", "tenant_id", "occurred_at"),
        Index("ix_audit_tenant_entity", "tenant_id", "entity", "entity_id"),
        Index("ix_audit_tenant_actor", "tenant_id", "actor_user_id"),
        Index("ix_audit_tenant_processo", "tenant_id", "processo_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Nullable: eventos de LOGIN_FALHA (usuário não identificado) podem não ter tenant.
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    actor_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    actor_tipo: Mapped[str] = mapped_column(
        String(20), default=ActorTipo.INTERNO.value, nullable=False
    )
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    entity: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    processo_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    nup: Mapped[Optional[str]] = mapped_column(String(25), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    origin: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    finalidade: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    base_legal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dados_antes_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    dados_depois_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    detalhe: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    hash_anterior: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    hash_registro: Mapped[str] = mapped_column(String(64), nullable=False)

    def __repr__(self) -> str:
        return f"<AuditTrail {self.action} {self.entity}:{self.entity_id}>"


class AuditChainState(Base):
    """Último hash da cadeia por tenant (para encadeamento transacional)."""

    __tablename__ = "audit_chain_state"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    ultimo_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
