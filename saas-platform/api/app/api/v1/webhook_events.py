import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.user import User
from app.models.webhook_event import WebhookEvent

router = APIRouter(prefix="/webhook-events", tags=["webhook-events"])


class WebhookEventResponse(BaseModel):
    id: str
    provider: str
    environment: str
    event_type: str
    external_event_id: Optional[str] = None
    external_object_id: Optional[str] = None
    processing_status: str
    attempts: int
    signature_valid: bool
    received_at: str
    processed_at: Optional[str] = None
    error_message: Optional[str] = None

    model_config = {"from_attributes": True}


@router.get("", response_model=list[WebhookEventResponse])
async def list_webhook_events(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    query = select(WebhookEvent)
    count_query = select(func.count(WebhookEvent.id))

    if status:
        query = query.where(WebhookEvent.processing_status == status)
        count_query = count_query.where(WebhookEvent.processing_status == status)
    if event_type:
        query = query.where(WebhookEvent.event_type == event_type)
        count_query = count_query.where(WebhookEvent.event_type == event_type)

    skip = (page - 1) * per_page
    result = await db.execute(
        query.order_by(WebhookEvent.received_at.desc())
        .offset(skip)
        .limit(per_page)
    )
    return result.scalars().all()


@router.get("/recent", response_model=list[WebhookEventResponse])
async def recent_webhook_events(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(WebhookEvent)
        .order_by(WebhookEvent.received_at.desc())
        .limit(limit)
    )
    return result.scalars().all()
