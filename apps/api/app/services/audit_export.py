"""Audit trail export service."""

import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent


async def export_audit_csv(
    db: AsyncSession,
    days: int = 90,
    action: Optional[str] = None,
    user_id: Optional[str] = None,
) -> str:
    """Export audit events as CSV string. Filters by retention period."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    query = select(AuditEvent).where(AuditEvent.created_at >= cutoff)

    if action:
        query = query.where(AuditEvent.action == action)
    if user_id:
        from uuid import UUID
        query = query.where(AuditEvent.user_id == UUID(user_id))

    query = query.order_by(AuditEvent.created_at.desc())

    result = await db.execute(query)
    events = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "timestamp", "action", "user_id", "entity_type",
        "entity_id", "description", "ip_address", "metadata",
    ])

    for evt in events:
        writer.writerow([
            str(evt.id),
            evt.created_at.isoformat() if evt.created_at else "",
            evt.action,
            str(evt.user_id) if evt.user_id else "",
            evt.entity_type or "",
            str(evt.entity_id) if evt.entity_id else "",
            evt.description or "",
            evt.ip_address or "",
            str(evt.extra_metadata or {}),
        ])

    return output.getvalue()


LOG_RETENTION_DAYS = 365


def get_log_retention_days() -> int:
    return LOG_RETENTION_DAYS
