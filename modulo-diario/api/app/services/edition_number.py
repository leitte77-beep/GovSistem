"""Edition number allocation service with concurrency safety.

The naive ``max(number)+1`` is not safe under concurrency: two simultaneous
creators could both read the same max and produce a duplicate number. This
service wraps next-number computation and insert in a PostgreSQL advisory
lock keyed by ``(organization_id, year, type)`` so the allocate-then-insert is
atomic within a transaction.

The DB unique constraint ``uq_edition_org_year_number_type`` remains the final
backstop against any duplicate.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import func, select, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.edition import Edition
from app.models.enums import EditionType

logger = logging.getLogger(__name__)


class EditionNumberService:
    """Allocates edition numbers under an advisory lock (PostgreSQL).

    On non-PostgreSQL dialects (e.g. SQLite in tests) the advisory lock is
    skipped — the DB unique constraint remains the backstop. In production
    (PostgreSQL) the lock makes ``max()+1`` + insert atomic within the txn.
    """

    @staticmethod
    def _is_postgres(db: AsyncSession) -> bool:
        try:
            return db.bind is not None and isinstance(db.bind.dialect, postgresql.dialect)
        except Exception:  # noqa: BLE001
            return False

    @staticmethod
    async def _advisory_lock(db: AsyncSession, key: int) -> None:
        """Acquire a session-scoped Postgres advisory lock."""
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})

    @staticmethod
    def _lock_key(organization_id: uuid.UUID, year: int, type_: EditionType) -> int:
        raw = f"{organization_id}-{year}-{type_.value}".encode("utf-8")
        import hashlib

        digest = hashlib.sha256(raw).digest()
        return int.from_bytes(digest[:8], "big") & 0x7FFFFFFFFFFFFFFF

    async def allocate(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        year: int,
        type_: EditionType,
    ) -> int:
        """Return the next edition number, holding the advisory lock."""
        if self._is_postgres(db):
            await self._advisory_lock(db, self._lock_key(organization_id, year, type_))
        result = await db.execute(
            select(func.coalesce(func.max(Edition.number), 0)).where(
                Edition.organization_id == organization_id,
                Edition.year == year,
                Edition.type == type_,
            )
        )
        return int(result.scalar() or 0) + 1


edition_number_service = EditionNumberService()
