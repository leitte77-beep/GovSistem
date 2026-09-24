"""Readiness service, /health endpoints and publication capability."""

import uuid

import pytest
from pydantic import SecretStr
from sqlalchemy import text

from app.core.config import settings
from app.models.act_type import ActType
from app.models.matter import Matter
from app.models.organization import Organization
from app.models.user import User
from app.services.matter_slug import lock_slug
from app.services.readiness import (
    FAIL,
    PASS,
    SKIP,
    WARN,
    CheckResult,
    ReadinessService,
    exit_code,
    publication_capability,
    summarize,
)

# ── pure aggregation ─────────────────────────────────────────────────────────


def test_summarize_and_exit_codes():
    assert summarize([CheckResult("A", "a", PASS)]) == "READY"
    assert exit_code([CheckResult("A", "a", PASS)]) == 0

    warn = [CheckResult("A", "a", PASS), CheckResult("B", "b", WARN)]
    assert summarize(warn) == "READY_WITH_WARNINGS"
    assert exit_code(warn) == 0
    assert exit_code(warn, strict=True) == 1

    fail = [CheckResult("A", "a", FAIL)]
    assert summarize(fail) == "NOT_READY"
    assert exit_code(fail) == 1


def test_skip_does_not_count_as_warning():
    assert summarize([CheckResult("A", "a", SKIP)]) == "READY"


def test_publication_capability_lists_reasons():
    capability = publication_capability(
        [
            CheckResult("STORAGE", "storage", PASS),
            CheckResult("TSA", "tsa", FAIL, detail="TSA_UNAVAILABLE", hint="config"),
        ]
    )
    assert capability["can_publish"] is False
    assert capability["reasons"][0]["code"] == "TSA"


# ── individual checks ────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_check_database_passes_on_sqlite(db_session):
    result = await ReadinessService().check_database(db_session)
    assert result.status == PASS
    assert result.data["dialect"] == "sqlite"


@pytest.mark.anyio
async def test_check_migrations_detects_head_match_and_drift(db_session, monkeypatch):
    await db_session.execute(text("DROP TABLE IF EXISTS alembic_version"))
    await db_session.execute(
        text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)")
    )
    await db_session.execute(text("INSERT INTO alembic_version VALUES ('abc123')"))
    await db_session.commit()

    service = ReadinessService()
    monkeypatch.setattr(service, "_alembic_heads", lambda: ["abc123"])
    monkeypatch.setattr(settings, "ALEMBIC_EXPECTED_HEAD", "abc123")
    assert (await service.check_migrations(db_session)).status == PASS

    monkeypatch.setattr(service, "_alembic_heads", lambda: ["def456"])
    behind = await service.check_migrations(db_session)
    assert behind.status == FAIL
    assert behind.data["current"] == ["abc123"]
    assert behind.hint == "alembic upgrade head"


@pytest.mark.anyio
async def test_check_migrations_fails_without_alembic_version(db_session, monkeypatch):
    await db_session.execute(text("DROP TABLE IF EXISTS alembic_version"))
    await db_session.commit()
    service = ReadinessService()
    monkeypatch.setattr(service, "_alembic_heads", lambda: ["abc123"])
    result = await service.check_migrations(db_session)
    assert result.status == FAIL


@pytest.mark.anyio
async def test_check_schema_reports_missing_trigger(db_session):
    migration = _load_migration()

    without = await ReadinessService().check_schema(db_session)
    assert without.status == FAIL
    assert "trg_matter_slug_immutable" in without.detail

    await db_session.execute(text(migration.SQLITE_TRIGGER_SQL))
    with_trigger = await ReadinessService().check_schema(db_session)
    assert with_trigger.status == PASS


@pytest.mark.anyio
async def test_check_storage_probe_passes():
    result = await ReadinessService().check_storage()
    assert result.status == PASS
    assert result.data["backend"]


@pytest.mark.anyio
async def test_check_slug_integrity_detects_problems(db_session):
    org, user, act_type = await _seed(db_session, "S")
    good = _new_matter(org, user, act_type, slug="decreto-1-2026", status="published")
    lock_slug(good)
    # published, has slug, but never locked
    unlocked = _new_matter(org, user, act_type, slug="decreto-2-2026", status="published")
    # non-normalized
    weird = _new_matter(org, user, act_type, slug="Decreto 3/2026", status="published")
    lock_slug(weird)
    db_session.add_all([good, unlocked, weird])
    await db_session.commit()

    result = await ReadinessService().check_slug_integrity(db_session)
    assert result.status == FAIL
    assert result.data["published"] == 3
    assert result.data["locked"] == 2
    assert result.data["non_normalized"] == 1


@pytest.mark.anyio
async def test_check_slug_integrity_passes_when_consistent(db_session):
    org, user, act_type = await _seed(db_session, "OK")
    matter = _new_matter(org, user, act_type, slug="decreto-1-2026", status="published")
    lock_slug(matter)
    db_session.add(matter)
    await db_session.commit()

    result = await ReadinessService().check_slug_integrity(db_session)
    assert result.status == PASS


# ── HTTP: live / ready ───────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_health_live_is_simple(client):
    response = await client.get("/api/v1/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.anyio
async def test_health_ready_ok(client, monkeypatch):
    async def _all_pass(self, db):
        return [CheckResult("DATABASE", "db", PASS), CheckResult("MIGRATIONS", "m", PASS)]

    monkeypatch.setattr(ReadinessService, "runtime_checks", _all_pass)
    response = await client.get("/api/v1/health/ready")
    assert response.status_code == 200
    assert response.json()["status"] == "READY"


@pytest.mark.anyio
async def test_health_ready_503_when_migration_behind(client, monkeypatch):
    async def _behind(self, db):
        return [CheckResult("MIGRATIONS", "migrations", FAIL, detail="behind")]

    monkeypatch.setattr(ReadinessService, "runtime_checks", _behind)
    response = await client.get("/api/v1/health/ready")
    assert response.status_code == 503


@pytest.mark.anyio
async def test_tsa_outage_does_not_break_readiness_but_blocks_publication(
    client, monkeypatch
):
    async def _ready(self, db):
        return [CheckResult("DATABASE", "db", PASS)]

    async def _tsa_down(self, db, *, probe=True, org=None):
        return [
            CheckResult("DATABASE", "db", PASS),
            CheckResult("TSA", "tsa", FAIL, detail="TSA_UNAVAILABLE"),
        ]

    monkeypatch.setattr(ReadinessService, "runtime_checks", _ready)
    monkeypatch.setattr(ReadinessService, "publication_checks", _tsa_down)
    monkeypatch.setattr(settings, "INTERNAL_API_KEY", SecretStr("test-key"))

    assert (await client.get("/api/v1/health/ready")).status_code == 200

    response = await client.get(
        "/api/v1/internal/publication-capability",
        headers={"X-Internal-Key": "test-key"},
    )
    assert response.status_code == 200
    assert response.json()["can_publish"] is False
    assert response.json()["reasons"][0]["code"] == "TSA"


# ── HTTP: internal endpoints auth + payload ──────────────────────────────────


@pytest.mark.anyio
async def test_internal_endpoints_require_key(client, monkeypatch):
    monkeypatch.setattr(settings, "INTERNAL_API_KEY", SecretStr("test-key"))
    assert (await client.get("/api/v1/internal/publication-capability")).status_code == 401
    assert (await client.get("/api/v1/internal/health/dependencies")).status_code == 401


@pytest.mark.anyio
async def test_internal_dependencies_payload(client, monkeypatch):
    async def _deps(self, db, *, probe=True):
        return [
            CheckResult("DATABASE", "db", PASS),
            CheckResult("TSA", "tsa", WARN, detail="indisponível"),
        ]

    monkeypatch.setattr(ReadinessService, "dependency_checks", _deps)
    monkeypatch.setattr(settings, "INTERNAL_API_KEY", SecretStr("test-key"))

    response = await client.get(
        "/api/v1/internal/health/dependencies",
        headers={"X-Internal-Key": "test-key"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "READY_WITH_WARNINGS"
    assert body["dependencies"]["tsa"]["status"] == WARN


# ── helpers ──────────────────────────────────────────────────────────────────


def _load_migration():
    import importlib.util
    import pathlib

    path = pathlib.Path("alembic/versions/m1n2o3p4q5r6_add_matter_slug_immutability.py")
    spec = importlib.util.spec_from_file_location("slug_immutability_migration_rd", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def _seed(session, prefix):
    org = Organization(
        name=f"Org {prefix}",
        slug=f"org-{prefix.lower()}",
        description="x",
        is_active=True,
        pdf_layout="classico",
        theme_config={},
    )
    session.add(org)
    await session.flush()
    user = User(
        name=f"User {prefix}",
        email=f"{prefix.lower()}@example.com",
        organization_id=org.id,
    )
    session.add(user)
    await session.flush()
    act_type = ActType(name="Decreto", is_active=True)
    session.add(act_type)
    await session.flush()
    return org, user, act_type


def _new_matter(org, user, act_type, *, slug, status):
    return Matter(
        id=uuid.uuid4(),
        organization_id=org.id,
        act_type_id=act_type.id,
        title="DECRETO Nº 1/2026",
        content_html="<p>texto</p>",
        plain_text="texto",
        author_id=user.id,
        status=status,
        slug=slug,
        act_number="1",
        act_year=2026,
    )
