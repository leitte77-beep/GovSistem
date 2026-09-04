"""Tests for edition number allocation (concurrency-safe)."""

from __future__ import annotations

import uuid

from app.models.enums import EditionType
from app.services.edition_number import EditionNumberService


def test_lock_key_is_deterministic_and_unique_per_type():
    org = uuid.uuid4()
    svc = EditionNumberService()
    k1 = svc._lock_key(org, 2026, EditionType.NORMAL)
    k2 = svc._lock_key(org, 2026, EditionType.NORMAL)
    assert k1 == k2
    # Different type/year -> different lock key.
    assert k1 != svc._lock_key(org, 2026, EditionType.EXTRA)
    assert k1 != svc._lock_key(org, 2027, EditionType.NORMAL)
    assert k1 < 2**63  # fits within Postgres advisory lock signed range


def test_allocate_calls_advisory_lock_and_returns_next(monkeypatch):
    # Simulate a PostgreSQL-backed session to assert the advisory lock is
    # requested and that the max()+1 is computed after it.
    class FakeResult:
        def scalar(self):
            return 41

    class FakeBind:
        dialect = __import__("sqlalchemy.dialects.postgresql", fromlist=["dialect"]).dialect()

    class FakeSession:
        bind = FakeBind()

        async def execute(self, stmt, params=None):
            return FakeResult()

    svc = EditionNumberService()
    captured = {}

    async def fake_lock(db, key):
        captured["lock_key"] = key

    import app.services.edition_number as mod

    mod.EditionNumberService._advisory_lock = staticmethod(fake_lock)
    import asyncio

    number = asyncio.run(svc.allocate(FakeSession(), uuid.uuid4(), 2026, EditionType.NORMAL))
    assert number == 42
    assert "lock_key" in captured
    assert captured["lock_key"] > 0


def test_allocate_skips_lock_on_non_postgres():
    class FakeResult:
        def scalar(self):
            return 41

    class FakeSession:
        bind = None

        async def execute(self, stmt, params=None):
            return FakeResult()

    svc = EditionNumberService()
    import asyncio

    number = asyncio.run(svc.allocate(FakeSession(), uuid.uuid4(), 2026, EditionType.NORMAL))
    assert number == 42
