"""Tests for the matter conference service (auto-invalidation logic)."""

from __future__ import annotations

import asyncio
import uuid

from app.services.conference import ConferenceService
from app.services.matter_version import canonical_payload, hash_canonical


def _sim(html: str):
    class _Sim:
        semantic_content = None
        content_json = None
        content_html = html
        act_number = "1"
        act_year = 2026
        act_date = None
        title = "T"
        summary = ""
        plain_text = html

    return _Sim()


def test_canonical_hash_of_review_content_differs_when_changed():
    h1 = hash_canonical(canonical_payload(_sim("<p>a</p>")))
    h2 = hash_canonical(canonical_payload(_sim("<p>b</p>")))
    assert h1 != h2
    assert h1 == hash_canonical(canonical_payload(_sim("<p>a</p>")))


def test_invalidation_updates_status():
    class FakeResult:
        rowcount = 2

    class FakeSession:
        async def execute(self, stmt):
            return FakeResult()

        async def flush(self):
            return None

    svc = ConferenceService(FakeSession())
    count = asyncio.run(svc.invalidate_for_matter(uuid.uuid4()))
    assert count == 2
