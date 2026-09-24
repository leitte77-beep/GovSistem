"""Tests for full-text search indexing."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.search_indexer import PostgresFtsProvider, get_search_provider


class TestSearchProvider:
    @pytest.mark.anyio
    async def test_search_no_results(self):
        db = AsyncMock()
        db.execute.return_value = MagicMock(
            scalar=MagicMock(return_value=0),
            all=MagicMock(return_value=[]),
        )
        provider = PostgresFtsProvider()
        results, total = await provider.search(
            "xyznonexistent999", db=db,
        )
        assert total == 0
        assert len(results) == 0

    def test_provider_singleton(self):
        p1 = get_search_provider()
        p2 = get_search_provider()
        assert p1 is p2

    @pytest.mark.anyio
    async def test_remove_matter(self):
        import uuid
        db = AsyncMock()
        db.execute = AsyncMock()
        provider = PostgresFtsProvider()
        await provider.remove_matter(uuid.uuid4(), db)
        db.execute.assert_called_once()

    @pytest.mark.anyio
    async def test_index_matter_creates_entry(self):
        import uuid
        db = AsyncMock()
        db.execute = AsyncMock()
        db.execute.return_value = MagicMock(
            scalar_one_or_none=MagicMock(return_value=None)
        )
        db.add = MagicMock()
        db.flush = AsyncMock()

        matter = MagicMock()
        matter.id = uuid.uuid4()
        matter.title = "Test Matter"
        matter.plain_text = "Test content"
        matter.act_type = MagicMock(name="Decreto")
        matter.org_unit = MagicMock()
        matter.org_unit.abbreviation = "SEAD"

        edition = MagicMock()
        edition.year = 2026
        edition.number = 1
        edition.publication_date = None

        provider = PostgresFtsProvider()
        await provider.index_matter(matter, edition, db)
        db.add.assert_called_once()
