"""Serviço de auditoria append-only (escritas e leituras sensíveis)."""

import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import user_role_names
from app.models.audit_trail import AuditTrail
from app.models.enums import AuditAccessType, AuditAction
from app.models.user import User


def _primary_role(user: User | None) -> str | None:
    if user is None:
        return None
    roles = user_role_names(user)
    return next(iter(sorted(roles)), None) if roles else None


async def record_audit(
    db: AsyncSession,
    *,
    tenant_id: Optional[uuid.UUID] = None,
    action: AuditAction | str,
    entity: str,
    entity_id: str | uuid.UUID | None = None,
    access_type: AuditAccessType | str = AuditAccessType.WRITE,
    actor: User | None = None,
    client_info: dict | None = None,
    diff_summary: dict | None = None,
    actor_role: str | None = None,
) -> AuditTrail:
    """Grava um evento na trilha. Não faz commit — segue a transação do request."""
    client_info = client_info or {}
    entry = AuditTrail(
        tenant_id=tenant_id,
        actor_user_id=actor.id if actor else None,
        actor_role=actor_role or _primary_role(actor),
        action=action.value if isinstance(action, AuditAction) else action,
        access_type=(
            access_type.value
            if isinstance(access_type, AuditAccessType)
            else access_type
        ),
        entity=entity,
        entity_id=str(entity_id) if entity_id is not None else None,
        ip_address=client_info.get("ip_address"),
        origin=client_info.get("origin") or client_info.get("user_agent"),
        request_id=client_info.get("request_id"),
        diff_summary=diff_summary,
    )
    db.add(entry)
    await db.flush()
    return entry
