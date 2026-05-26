import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.audit_event import AuditEvent
from app.models.user import User
from app.schemas.schemas import AuditEventResponse, PaginatedResponse

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/events", response_model=PaginatedResponse)
async def list_audit_events(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    organization_id: uuid.UUID | None = Query(None),
    days: int | None = Query(None),
    _: User = Depends(get_current_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(AuditEvent)
    count_query = select(func.count(AuditEvent.id))

    if action:
        query = query.where(AuditEvent.action == action)
        count_query = count_query.where(AuditEvent.action == action)
    if resource_type:
        query = query.where(AuditEvent.resource_type == resource_type)
        count_query = count_query.where(AuditEvent.resource_type == resource_type)
    if organization_id:
        query = query.where(AuditEvent.organization_id == organization_id)
        count_query = count_query.where(AuditEvent.organization_id == organization_id)
    if days:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        query = query.where(AuditEvent.created_at >= cutoff)
        count_query = count_query.where(AuditEvent.created_at >= cutoff)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    skip = (page - 1) * per_page
    query = query.order_by(AuditEvent.created_at.desc()).offset(skip).limit(per_page)
    result = await db.execute(query)
    items = result.scalars().all()

    return PaginatedResponse(data=[AuditEventResponse.model_validate(e) for e in items], total=total, page=page, per_page=per_page)
