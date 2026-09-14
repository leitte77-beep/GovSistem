"""Tenant boundaries for the administrative semantic-document API."""

import uuid

import pytest
from fastapi import HTTPException

from app.api.v1.semantic import _get_matter_or_404
from app.models.act_type import ActType
from app.models.matter import Matter
from app.models.organization import Organization
from app.models.user import User


@pytest.mark.anyio
async def test_semantic_lookup_hides_matter_from_another_organization(db_session):
    """Even an ADMIN from another municipality must receive no object details."""
    owner_org = Organization(name="Prefeitura A", slug=f"a-{uuid.uuid4().hex[:8]}")
    other_org = Organization(name="Prefeitura B", slug=f"b-{uuid.uuid4().hex[:8]}")
    act_type = ActType(name=f"Portaria {uuid.uuid4().hex[:8]}")
    db_session.add_all([owner_org, other_org, act_type])
    await db_session.flush()

    author = User(
        name="Autor A",
        email=f"autor-{uuid.uuid4().hex[:8]}@example.test",
        organization_id=owner_org.id,
        is_active=True,
    )
    db_session.add(author)
    await db_session.flush()
    matter = Matter(
        organization_id=owner_org.id,
        act_type_id=act_type.id,
        title="PORTARIA Nº 1/2026",
        content_html="<p>Conteúdo</p>",
        plain_text="Conteúdo",
        author_id=author.id,
    )
    db_session.add(matter)
    await db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await _get_matter_or_404(matter.id, other_org.id, db_session)

    assert exc.value.status_code == 404
