import uuid
from typing import Callable

from fastapi import Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent
from app.models.enums import AuditAction


async def capture_request_info(request: Request) -> dict:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "unknown"
    return {
        "ip_address": ip,
        "user_agent": request.headers.get("user-agent", ""),
    }


async def audit_middleware(request: Request, call_next: Callable) -> Response:
    info = await capture_request_info(request)
    request.state.client_ip = info["ip_address"]
    request.state.user_agent = info["user_agent"]
    response = await call_next(request)
    return response


async def log_audit_event(
    db: AsyncSession,
    action: AuditAction,
    user_id: uuid.UUID | None = None,
    organization_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    description: str | None = None,
    extra_metadata: dict | None = None,
    ip_address: str | None = None,
) -> AuditEvent:
    event = AuditEvent(
        organization_id=organization_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        description=description,
        extra_metadata=extra_metadata,
        ip_address=ip_address,
    )
    db.add(event)
    await db.commit()
    return event
