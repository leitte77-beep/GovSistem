"""Central de notificações internas."""

import uuid
from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import NotificationType
from app.models.governance import Notification


async def notify(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    type_: NotificationType,
    title: str,
    body: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[uuid.UUID] = None,
    dedupe_key: Optional[str] = None,
) -> Optional[Notification]:
    """Cria uma notificação. `dedupe_key` evita repetir o mesmo alerta
    (as rotinas automáticas rodam várias vezes por dia)."""
    if dedupe_key:
        exists = await db.scalar(
            select(Notification.id).where(
                Notification.user_id == user_id,
                Notification.dedupe_key == dedupe_key,
            )
        )
        if exists:
            return None
    notification = Notification(
        user_id=user_id,
        type=type_.value,
        title=title[:200],
        body=body,
        resource_type=resource_type,
        resource_id=resource_id,
        dedupe_key=dedupe_key,
    )
    db.add(notification)
    return notification


async def notify_many(
    db: AsyncSession,
    *,
    user_ids: Iterable[uuid.UUID],
    type_: NotificationType,
    title: str,
    body: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[uuid.UUID] = None,
    dedupe_key: Optional[str] = None,
) -> None:
    for user_id in set(user_ids):
        await notify(
            db,
            user_id=user_id,
            type_=type_,
            title=title,
            body=body,
            resource_type=resource_type,
            resource_id=resource_id,
            dedupe_key=f"{dedupe_key}:{user_id}" if dedupe_key else None,
        )
