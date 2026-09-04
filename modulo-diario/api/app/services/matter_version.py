"""Matter versioning service.

Captures an immutable snapshot of a matter on meaningful events only (not on
every keystroke — callers apply debounce/checkpoint). It computes a canonical
content hash so a changed version always has a different hash.
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.matter import Matter
from app.models.matter_version import MatterVersion

logger = logging.getLogger(__name__)


def canonical_payload(matter: Matter) -> dict:
    """Deterministic canonical payload for hashing a matter's content."""
    semantic = matter.semantic_content
    content_json = matter.content_json
    html = matter.content_html or ""

    return {
        "semantic_content": semantic,
        "content_json": content_json,
        "content_html": html,
        "act_number": matter.act_number,
        "act_year": matter.act_year,
        "act_date": matter.act_date.isoformat() if matter.act_date else None,
        "title": matter.title,
        "summary": matter.summary or "",
        "plain_text": matter.plain_text or "",
    }


def hash_canonical(payload: dict) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
    ).hexdigest()


class MatterVersionService:
    """Creates MatterVersion rows for a matter when content meaningfully changes."""

    def __init__(self, db: AsyncSession, user_id: uuid.UUID | None = None) -> None:
        self._db = db
        self._user_id = user_id

    async def _next_version_number(self, matter_id: uuid.UUID) -> int:
        result = await self._db.execute(
            select(func.coalesce(func.max(MatterVersion.version_number), 0)).where(
                MatterVersion.matter_id == matter_id
            )
        )
        return int(result.scalar() or 0) + 1

    async def capture(
        self,
        matter: Matter,
        reason: str,
        source: str = "server_autosave",
    ) -> MatterVersion | None:
        """Capture a version if the content hash changed from the last captured one."""
        payload = canonical_payload(matter)
        content_hash = hash_canonical(payload)

        last = await self._db.execute(
            select(MatterVersion)
            .where(MatterVersion.matter_id == matter.id)
            .order_by(MatterVersion.version_number.desc())
            .limit(1)
        )
        prev = last.scalar_one_or_none()
        if prev is not None and prev.content_hash == content_hash:
            # Content unchanged: skip creating a useless version.
            return None

        number = await self._next_version_number(matter.id)
        version = MatterVersion(
            organization_id=matter.organization_id,
            matter_id=matter.id,
            version_number=number,
            canonical_content={"semantic_content": matter.semantic_content,
                               "content_json": matter.content_json},
            rendered_html=matter.content_html,
            content_hash=content_hash,
            created_by=self._user_id,
            change_reason=reason,
            source=source,
            matter_status=(
                matter.status.value
                if hasattr(matter.status, "value")
                else str(matter.status)
            ),
        )
        self._db.add(version)
        # Keep the matter's version counter in sync.
        matter.version = max(int(matter.version or 1), number)
        await self._db.flush()
        logger.info(
            "MatterVersion captured: matter=%s v%s reason=%s hash=%s",
            matter.id, number, reason, content_hash,
        )
        return version
