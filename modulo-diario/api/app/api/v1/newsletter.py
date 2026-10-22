"""Admin: inscritos do boletim e histórico de envios da organização do usuário."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_roles
from app.core.database import get_db
from app.models.edition import Edition
from app.models.newsletter import NewsletterDispatch, NewsletterSubscriber
from app.models.user import User
from app.services import newsletter

router = APIRouter(prefix="/newsletter", tags=["newsletter"])


@router.get("")
async def newsletter_overview(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN")),
):
    org_id = user.organization_id
    counts = dict(
        (
            await db.execute(
                select(NewsletterSubscriber.status, func.count())
                .where(NewsletterSubscriber.organization_id == org_id)
                .group_by(NewsletterSubscriber.status)
            )
        ).all()
    )
    subs = (
        await db.execute(
            select(NewsletterSubscriber)
            .where(NewsletterSubscriber.organization_id == org_id)
            .order_by(NewsletterSubscriber.created_at.desc())
            .limit(500)
        )
    ).scalars().all()
    dispatches = (
        await db.execute(
            select(NewsletterDispatch, Edition.number, Edition.year)
            .join(Edition, Edition.id == NewsletterDispatch.edition_id)
            .where(NewsletterDispatch.organization_id == org_id)
            .order_by(NewsletterDispatch.created_at.desc())
            .limit(20)
        )
    ).all()
    return {
        "enabled": newsletter.is_enabled(),
        "counts": {k: counts.get(k, 0) for k in ("confirmed", "pending", "unsubscribed")},
        "subscribers": [
            {
                "id": str(s.id),
                "email": s.email,
                "status": s.status,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "confirmed_at": s.confirmed_at.isoformat() if s.confirmed_at else None,
            }
            for s in subs
        ],
        "dispatches": [
            {
                "edition": f"{number}/{year}",
                "recipients": d.recipients,
                "sent": d.sent,
                "failed": d.failed,
                "created_at": d.created_at.isoformat() if d.created_at else None,
                "finished_at": d.finished_at.isoformat() if d.finished_at else None,
            }
            for d, number, year in dispatches
        ],
    }


@router.delete("/subscribers/{subscriber_id}")
async def newsletter_remove_subscriber(
    subscriber_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN")),
):
    """Remove de vez (pedido de exclusão de dados pela LGPD)."""
    import uuid

    try:
        sid = uuid.UUID(subscriber_id)
    except ValueError:
        raise HTTPException(404, "Inscrito não encontrado")
    sub = await db.get(NewsletterSubscriber, sid)
    if sub is None or sub.organization_id != user.organization_id:
        raise HTTPException(404, "Inscrito não encontrado")
    await db.delete(sub)
    await db.commit()
    return {"status": "deleted"}
