"""Serviço de auditoria — todo registro passa por aqui (append-only)."""

import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import AuditAction, AuditResult
from app.models.governance import AuditLog
from app.models.user import User

# Nunca gravar valores destes campos em `data_before`/`data_after`.
SENSITIVE_KEYS = {
    "password",
    "senha",
    "password_hash",
    "token",
    "token_hash",
    "secret",
    "authorization",
    "access_token",
    "refresh_token",
    "backup_encryption_password",
}


def sanitize(data: Optional[dict]) -> Optional[dict]:
    if not data:
        return None
    clean = {}
    for key, value in data.items():
        if key.lower() in SENSITIVE_KEYS:
            clean[key] = "***"
        elif isinstance(value, (uuid.UUID,)):
            clean[key] = str(value)
        elif isinstance(value, dict):
            clean[key] = sanitize(value)
        elif hasattr(value, "isoformat"):
            clean[key] = value.isoformat()
        else:
            clean[key] = value
    return clean


async def record(
    db: AsyncSession,
    *,
    action: AuditAction,
    user: Optional[User] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[uuid.UUID] = None,
    resource_name: Optional[str] = None,
    institution_id: Optional[uuid.UUID] = None,
    secretariat_id: Optional[uuid.UUID] = None,
    department_id: Optional[uuid.UUID] = None,
    result: AuditResult = AuditResult.SUCESSO,
    detail: Optional[str] = None,
    data_before: Optional[dict] = None,
    data_after: Optional[dict] = None,
    client: Optional[dict] = None,
) -> AuditLog:
    client = client or {}
    log = AuditLog(
        institution_id=institution_id or (user.institution_id if user else None),
        user_id=user.id if user else None,
        user_name=user.name if user else None,
        action=action.value,
        resource_type=resource_type,
        resource_id=resource_id,
        resource_name=(resource_name or "")[:300] or None,
        secretariat_id=secretariat_id,
        department_id=department_id,
        ip_address=client.get("ip_address"),
        user_agent=client.get("user_agent"),
        result=result.value,
        detail=detail,
        data_before=sanitize(data_before),
        data_after=sanitize(data_after),
        correlation_id=client.get("correlation_id"),
    )
    db.add(log)
    return log
