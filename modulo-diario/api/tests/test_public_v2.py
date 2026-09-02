from __future__ import annotations

import hashlib
import json
import uuid
from datetime import date, datetime, timezone

import pytest

from app.api.public_v2 import _build_v2, public_verification
from app.models.edition import Edition
from app.models.edition_publication_snapshot import EditionPublicationSnapshot
from app.models.enums import EditionStatus, EditionType
from app.models.organization import Organization
from app.models.user import User


async def _seed_edition_with_snapshot(session):
    org = Organization(
        name="PREFEITURA DE FAROL",
        slug="farol",
        is_active=True,
        pdf_layout="classico",
        theme_config={},
    )
    session.add(org)
    await session.flush()
    user = User(name="Adm", email="adm@farol", organization_id=org.id)
    session.add(user)
    await session.flush()

    edition = Edition(
        organization_id=org.id,
        number=23,
        year=2026,
        type=EditionType.NORMAL,
        title="Diário Oficial - Edição 23",
        publication_date=date(2026, 9, 2),
        status=EditionStatus.PUBLISHED,
        created_by=user.id,
        verification_code="20260023-296CD414",
    )
    session.add(edition)
    await session.flush()

    mid = uuid.uuid4()
    item = {
        "id": str(mid),
        "position": 0,
        "section_title": None,
        "title": "PORTARIA 04/2026",
        "summary": "EXONERA A SERVIDORA NEIDE",
        "act_type_id": None,
        "org_unit_id": None,
        "act_number": "04",
        "act_year": 2026,
        "act_date": "2026-09-01",
        "publication_type": "normal",
        "references_matter_id": None,
        "responsible": {"name": "Prefeito", "role": "Prefeito Municipal"},
        "content_html": "<p>RESOLVE exonerar.</p>",
        "semantic": None,
        "semantic_hash": None,
    }
    content = {
        "schema": "edition_publication_snapshot",
        "schema_version": 1,
        "edition_id": str(edition.id),
        "organization_id": str(org.id),
        "items": [item],
    }
    digest = hashlib.sha256(
        json.dumps(content, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()
    snapshot = EditionPublicationSnapshot(
        edition_id=edition.id,
        organization_id=org.id,
        content=content,
        content_manifest_hash=digest,
        frozen_at=datetime.now(timezone.utc),
        is_valid=True,
    )
    session.add(snapshot)
    await session.commit()
    return org, user, edition


@pytest.mark.asyncio
async def test_public_snapshot_v2_structure(db_session):
    org, _, edition = await _seed_edition_with_snapshot(db_session)
    body = await _build_v2(db_session, 2026, 23, org)
    assert body["schema_version"] == 2
    assert body["edition"]["edition"]["year"] == 2026
    assert body["edition"]["edition"]["number"] == 23
    assert body["total_matters"] == 1
    m = body["matters"][0]
    assert m["act_number"] == "04"
    assert m["act_year"] == 2026
    assert m["publication_type"] == "normal"
    assert len(m["matter_content_hash"]) == 64
    assert m["matter_content_hash"] == m["matter_content_hash"]
    assert body["edition"]["publisher"]["slug"] == "farol"
    assert body["edition"]["integrity"]["signed_pdf_hash"] is None


@pytest.mark.asyncio
async def test_public_verification_resolves_edition(db_session):
    org, _, edition = await _seed_edition_with_snapshot(db_session)
    result = await public_verification(
        "20260023-296CD414", matter_id=None, db=db_session, tenant=org
    )
    assert result["found"] is True
    assert result["valid"] is True
    assert result["kind"] == "edition"
    assert result["document"]["edition"]["verification_code"] == "20260023-296CD414"
    assert result["total_matters"] == 1


@pytest.mark.asyncio
async def test_verification_lowercase_and_spaces(db_session):
    org, _, _ = await _seed_edition_with_snapshot(db_session)
    result = await public_verification(
        "  20260023-296cd414  ", matter_id=None, db=db_session, tenant=org
    )
    assert result["found"] is True


@pytest.mark.asyncio
async def test_verification_unknown_code_and_tenant_isolated(db_session):
    org, _, _ = await _seed_edition_with_snapshot(db_session)
    miss = await public_verification("20269999-AAAAAA", matter_id=None, db=db_session, tenant=org)
    assert miss["found"] is False

    # wrong tenant cannot see the code
    other = Organization(
        name="OUTRO", slug="outro", is_active=True, pdf_layout="classico", theme_config={}
    )
    db_session.add(other)
    await db_session.commit()
    isolated = await public_verification(
        "20260023-296CD414", matter_id=None, db=db_session, tenant=other
    )
    assert isolated["found"] is False
