"""Matter conference service.

Does not create reviews in the controller; provides helpers to create/review a
matter conference and to auto-invalidate an active conference when the matter's
content hash changes — preventing the publication of a version that was not
conferred.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.matter import Matter
from app.models.matter_review import MatterReview

logger = logging.getLogger(__name__)


class ConferenceService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def create_review(
        self,
        matter: Matter,
        content_hash: str,
        render_hash: str | None,
        reviewed_by: uuid.UUID,
        approved: bool = True,
        comments: str | None = None,
        version_id: uuid.UUID | None = None,
    ) -> MatterReview:
        review = MatterReview(
            organization_id=matter.organization_id,
            matter_id=matter.id,
            version_id=version_id,
            content_hash=content_hash,
            render_hash=render_hash,
            reviewed_by=reviewed_by,
            reviewed_at=datetime.now(timezone.utc),
            approved=approved,
            comments=comments,
            status="active",
        )
        self._db.add(review)
        await self._db.flush()
        return review

    async def invalidate_for_matter(
        self, matter_id: uuid.UUID, reason: str = "content_changed"
    ) -> int:
        """Invalidate all active reviews for a matter (content changed)."""
        result = await self._db.execute(
            update(MatterReview)
            .where(
                MatterReview.matter_id == matter_id,
                MatterReview.status == "active",
            )
            .values(status="invalidated", invalidated_at=datetime.now(timezone.utc))
        )
        await self._db.flush()
        count = result.rowcount or 0
        if count:
            logger.info("Invalidated %s active reviews for matter %s", count, matter_id)
        return count

    async def has_active_review(self, matter_id: uuid.UUID) -> bool:
        result = await self._db.execute(
            select(MatterReview.id)
            .where(MatterReview.matter_id == matter_id, MatterReview.status == "active")
            .limit(1)
        )
        return result.scalar_one_or_none() is not None
