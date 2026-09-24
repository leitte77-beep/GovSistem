"""Slug immutability: domain guard, lock marker, generation and DB trigger.

The trigger test loads the DDL from the migration module itself, so the test
cannot drift from what is actually deployed (SQLite equivalent; PostgreSQL uses
the plpgsql variant in the same migration).
"""

import importlib.util
import pathlib
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import text
from sqlalchemy import update as sa_update

from app.models.act_type import ActType
from app.models.enums import EditionStatus
from app.models.matter import Matter
from app.models.organization import Organization
from app.models.user import User
from app.services.matter_slug import (
    PublishedMatterSlugImmutableError,
    assert_slug_change_allowed,
    generate_unique_slug,
    is_normalized_slug,
    lock_slug,
    matter_slug,
    slug_change_allowed,
)
from app.services.publication_gate import assert_publishable

MIGRATION_FILE = "alembic/versions/m1n2o3p4q5r6_add_matter_slug_immutability.py"


def _load_migration():
    path = pathlib.Path(MIGRATION_FILE)
    spec = importlib.util.spec_from_file_location("slug_immutability_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ── domain guard ─────────────────────────────────────────────────────────────


def _matter(**overrides):
    base = {
        "slug": None,
        "slug_locked_at": None,
        "slug_locked_reason": None,
        "publication_type": "normal",
        "act_number": None,
        "act_year": None,
        "title": "Título",
        "document_type": None,
        "id": uuid.uuid4(),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_unpublished_matter_can_receive_slug():
    assert slug_change_allowed(_matter(), "decreto-214-2026") is True
    assert_slug_change_allowed(_matter(), "decreto-214-2026")


def test_unpublished_matter_can_correct_slug():
    assert slug_change_allowed(_matter(slug="errado"), "correto") is True


def test_first_publication_locks_slug():
    matter = _matter(slug="decreto-214-2026")
    lock_slug(matter, reason="first_publication")
    assert matter.slug_locked_at is not None
    assert matter.slug_locked_reason == "first_publication"


def test_lock_slug_is_idempotent():
    matter = _matter(slug="decreto-214-2026")
    first = datetime(2026, 1, 1, tzinfo=timezone.utc)
    lock_slug(matter, now=first)
    lock_slug(matter, reason="other", now=datetime(2030, 1, 1, tzinfo=timezone.utc))
    assert matter.slug_locked_at == first
    assert matter.slug_locked_reason == "first_publication"


def test_locked_slug_cannot_change():
    matter = _matter(
        slug="decreto-214-2026",
        slug_locked_at=datetime.now(timezone.utc),
    )
    assert slug_change_allowed(matter, "decreto-214-2026") is True
    assert slug_change_allowed(matter, "decreto-215-2026") is False
    with pytest.raises(PublishedMatterSlugImmutableError):
        assert_slug_change_allowed(matter, "decreto-215-2026")


def test_locked_slug_ignores_title_change():
    matter = _matter(
        slug="decreto-214-2026",
        slug_locked_at=datetime.now(timezone.utc),
        title="TÍTULO COMPLETAMENTE NOVO",
        act_number="214",
        act_year=2026,
    )
    act_type = SimpleNamespace(name="Decreto")
    # The stored slug is authoritative; the changed title never recalculates it.
    assert matter_slug(matter, act_type) == "decreto-214-2026"
    with pytest.raises(PublishedMatterSlugImmutableError):
        assert_slug_change_allowed(matter, "titulo-completamente-novo-2026")


def test_rectified_or_archived_matter_keeps_locked_slug():
    for status in ("published", "archived"):
        matter = _matter(
            slug="decreto-214-2026",
            slug_locked_at=datetime.now(timezone.utc),
            status=status,
        )
        assert slug_change_allowed(matter, "outro") is False


def test_normalization_helper():
    assert is_normalized_slug("decreto-214-2026")
    assert not is_normalized_slug("Decreto 214/2026")
    assert not is_normalized_slug("decreto--214")


# ── generation ───────────────────────────────────────────────────────────────


def test_rectification_gets_its_own_prefixed_slug():
    matter = _matter(
        publication_type="rectification",
        act_number="214",
        act_year=2026,
        title="RETIFICAÇÃO — DECRETO Nº 214/2026",
    )
    act_type = SimpleNamespace(name="Decreto")
    assert matter_slug(matter, act_type) == "retificacao-decreto-214-2026"


def test_normal_publication_slug_is_not_prefixed():
    matter = _matter(act_number="214", act_year=2026)
    act_type = SimpleNamespace(name="Decreto")
    assert matter_slug(matter, act_type) == "decreto-214-2026"


async def _seed(session, prefix="A"):
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


def _new_matter(org, user, act_type, *, slug=None, status="draft"):
    return Matter(
        id=uuid.uuid4(),
        organization_id=org.id,
        act_type_id=act_type.id,
        title="DECRETO Nº 214/2026",
        content_html="<p>texto</p>",
        plain_text="texto",
        author_id=user.id,
        status=status,
        act_number="214",
        act_year=2026,
        slug=slug,
    )


@pytest.mark.anyio
async def test_collision_suffix_applied_before_lock(db_session):
    org, user, act_type = await _seed(db_session, "C")

    first = _new_matter(org, user, act_type)
    first.slug = await generate_unique_slug(db_session, org.id, first, act_type)
    db_session.add(first)
    await db_session.flush()

    second = _new_matter(org, user, act_type)
    second.slug = await generate_unique_slug(db_session, org.id, second, act_type)

    assert first.slug == "decreto-214-2026"
    assert second.slug == "decreto-214-2026-2"


# ── DB trigger (SQLite equivalent from the migration) ────────────────────────


@pytest.mark.anyio
async def test_trigger_blocks_direct_slug_update(db_session):
    migration = _load_migration()
    await db_session.execute(text(migration.SQLITE_TRIGGER_SQL))

    org, user, act_type = await _seed(db_session, "T")
    locked = _new_matter(org, user, act_type, slug="decreto-214-2026", status="published")
    locked.slug_locked_at = datetime.now(timezone.utc)
    locked.slug_locked_reason = "first_publication"
    free = _new_matter(org, user, act_type, slug="rascunho-2026", status="draft")
    db_session.add_all([locked, free])
    locked_id, free_id = locked.id, free.id
    await db_session.commit()

    with pytest.raises(Exception) as exc:
        await db_session.execute(
            sa_update(Matter).where(Matter.id == locked_id).values(slug="alterado")
        )
    assert "immutable" in str(exc.value).lower()
    await db_session.rollback()

    # An unlocked matter may still have its slug corrected.
    await db_session.execute(
        sa_update(Matter).where(Matter.id == free_id).values(slug="corrigido-2026")
    )
    await db_session.commit()


# ── publication gate ─────────────────────────────────────────────────────────


def _gate_edition(matters):
    items = [SimpleNamespace(matter=m, page_number=1) for m in matters]
    return SimpleNamespace(
        status=EditionStatus.SIGNED,
        signatures=[SimpleNamespace(timestamp_records=[])],
        signed_pdf_path="signed.pdf",
        signed_pdf_hash="hash",
        signature_validation_status="valid",
        items=items,
    )


def test_gate_rejects_unnormalized_slug():
    matter = _matter(slug="Decreto 214/2026")
    problems = assert_publishable(_gate_edition([matter]))
    assert any("normalizado" in p for p in problems)


def test_gate_rejects_locked_matter_without_slug():
    matter = _matter(slug=None, slug_locked_at=datetime.now(timezone.utc))
    problems = assert_publishable(_gate_edition([matter]))
    assert any("slug travado" in p for p in problems)


def test_gate_accepts_matter_without_slug_yet():
    # No slug and not locked: it will be generated and locked on publication.
    assert assert_publishable(_gate_edition([_matter(slug=None)])) == []
