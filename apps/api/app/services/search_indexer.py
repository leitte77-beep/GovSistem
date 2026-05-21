"""Full-text search indexer using PostgreSQL FTS with Portuguese support.

Provides SearchProvider abstraction for future OpenSearch migration.
"""

import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.edition import Edition
from app.models.matter import Matter
from app.models.search_index import SearchIndex


@dataclass
class SearchResult:
    matter_id: str
    title: str
    act_type: str
    org_unit: str
    snippet: str
    edition_number: str
    publication_date: Optional[str]
    rank: float


class SearchProvider(ABC):
    """Abstract search provider. Implement for PostgreSQL FTS or OpenSearch."""

    @abstractmethod
    async def index_matter(self, matter: Matter, edition: Edition, db: AsyncSession) -> None: ...

    @abstractmethod
    async def remove_matter(self, matter_id: uuid.UUID, db: AsyncSession) -> None: ...

    @abstractmethod
    async def search(
        self, query: str, db: AsyncSession,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        org_unit: Optional[str] = None,
        act_type: Optional[str] = None,
        page: int = 0, page_size: int = 20,
    ) -> tuple[list[SearchResult], int]: ...


class PostgresFtsProvider(SearchProvider):
    """PostgreSQL Full-Text Search with Portuguese config and unaccent."""

    FTS = "portuguese"

    async def index_matter(self, matter: Matter, edition: Edition, db: AsyncSession) -> None:
        act_type = matter.act_type.name if matter.act_type else ""
        org_unit = matter.org_unit.abbreviation if matter.org_unit else ""
        edition_num = f"{edition.year}/{edition.number}"

        result = await db.execute(
            select(SearchIndex).where(SearchIndex.matter_id == matter.id)
        )
        idx = result.scalar_one_or_none()

        if idx is None:
            idx = SearchIndex(matter_id=matter.id, edition_id=edition.id)
            db.add(idx)

        idx.title = matter.title
        idx.act_type = act_type
        idx.org_unit = org_unit
        idx.plain_text = matter.plain_text or ""
        idx.edition_number = edition_num
        idx.publication_date = edition.publication_date
        await db.flush()

        # Update tsvector via raw SQL with unaccent support
        await db.execute(text("""
            UPDATE search_index
            SET search_vector = to_tsvector(:fts, unaccent(coalesce(:title, '') || ' ' ||
                coalesce(:act_type, '') || ' ' || coalesce(:org_unit, '') || ' ' ||
                coalesce(:edition_number, '') || ' ' || coalesce(:plain_text, '')))
            WHERE id = :idx_id
        """), {
            "fts": self.FTS,
            "title": idx.title,
            "act_type": idx.act_type,
            "org_unit": idx.org_unit,
            "edition_number": idx.edition_number,
            "plain_text": idx.plain_text,
            "idx_id": idx.id,
        })

    async def remove_matter(self, matter_id: uuid.UUID, db: AsyncSession) -> None:
        await db.execute(
            sa.delete(SearchIndex).where(SearchIndex.matter_id == matter_id)
        )

    async def search(
        self, query: str, db: AsyncSession,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        org_unit: Optional[str] = None,
        act_type: Optional[str] = None,
        page: int = 0, page_size: int = 20,
    ) -> tuple[list[SearchResult], int]:
        text("plainto_tsquery(:fts, unaccent(:q))")
        tsq_params = {"fts": self.FTS, "q": query}

        base = text("""
            FROM search_index si
            WHERE si.search_vector @@ plainto_tsquery(:fts, unaccent(:q))
        """)

        filters = []
        params = {**tsq_params}
        if date_from:
            filters.append("si.publication_date >= :date_from")
            params["date_from"] = date_from
        if date_to:
            filters.append("si.publication_date <= :date_to")
            params["date_to"] = date_to
        if org_unit:
            filters.append("si.org_unit ILIKE :org_unit")
            params["org_unit"] = f"%{org_unit}%"
        if act_type:
            filters.append("si.act_type ILIKE :act_type")
            params["act_type"] = f"%{act_type}%"

        where_extra = " AND " + " AND ".join(filters) if filters else ""
        base_str = str(base) + where_extra

        count_result = await db.execute(
            text("SELECT COUNT(*)" + base_str), params
        )
        total = count_result.scalar() or 0

        select_str = """
            SELECT si.matter_id, si.title, si.act_type, si.org_unit,
                ts_headline(:fts, si.plain_text,
                    plainto_tsquery(:fts, unaccent(:q2)),
                    'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20'
                ) AS snippet,
                si.edition_number, si.publication_date::text,
                ts_rank(si.search_vector, plainto_tsquery(:fts, unaccent(:q3))) AS rank
        """ + base_str + " ORDER BY rank DESC, si.publication_date DESC"
        select_str += " OFFSET :offset LIMIT :limit"

        select_params = {**params, "q2": query, "q3": query,
                         "offset": page * page_size, "limit": page_size}

        result = await db.execute(text(select_str), select_params)
        rows = result.all()

        items = [
            SearchResult(
                matter_id=str(r.matter_id), title=r.title,
                act_type=r.act_type, org_unit=r.org_unit,
                snippet=r.snippet, edition_number=r.edition_number,
                publication_date=str(r.publication_date) if r.publication_date else None,
                rank=float(r.rank) if r.rank else 0.0,
            )
            for r in rows
        ]
        return items, total


_search_provider: Optional[SearchProvider] = None


def get_search_provider() -> SearchProvider:
    global _search_provider
    if _search_provider is None:
        _search_provider = PostgresFtsProvider()
    return _search_provider
