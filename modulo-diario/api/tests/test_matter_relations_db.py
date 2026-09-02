from __future__ import annotations

import pytest

from app.models.act_type import ActType
from app.models.matter import Matter
from app.models.matter_relation import MatterRelation
from app.models.organization import Organization
from app.models.user import User
from app.services.matter_relations import (
    RelationError,
    create_relation,
    delete_relation,
    legal_status_flags,
    list_relations_for_matter,
)


async def _seed(session, slug, user_email, prefix):
    org = Organization(
        name=f"Org {prefix}",
        slug=slug,
        description="x",
        is_active=True,
        pdf_layout="classico",
        theme_config={},
    )
    session.add(org)
    await session.flush()
    user = User(name=f"User {prefix}", email=user_email, organization_id=org.id)
    session.add(user)
    await session.flush()
    at = ActType(name=f"Type {prefix}", is_active=True)
    session.add(at)
    await session.flush()

    def matter(num: str) -> Matter:
        m = Matter(
            organization_id=org.id,
            act_type_id=at.id,
            title=f"PORTARIA {prefix} {num}",
            content_html=f"<p>texto {num}</p>",
            plain_text=f"texto {num}",
            summary=None,
            act_number=num,
            act_year=2026,
            author_id=user.id,
            status="published",
        )
        session.add(m)
        return m

    return org, user, at, matter


async def _flush_all(session):
    await session.commit()


@pytest.mark.asyncio
async def test_relations_flow_and_tenant_isolation(db_session):
    org1, u1, _, mk1 = await _seed(db_session, "org-a", "a@x", "A")
    org2, u2, _, mk2 = await _seed(db_session, "org-b", "b@x", "B")
    a = mk1("1")  # portaria 1/2026
    b = mk1("2")  # portaria 2/2026 (target)
    c = mk2("9")
    await _flush_all(db_session)
    await db_session.refresh(a)
    await db_session.refresh(b)
    await db_session.refresh(c)

    # valid relation A RECTIFIES B within org1
    rel = await create_relation(
        db_session,
        organization_id=org1.id,
        source_matter_id=a.id,
        target_matter_id=b.id,
        relation_type="rectifies",
        actor_id=u1.id,
    )
    assert rel.id is not None

    # self relation rejected
    with pytest.raises(RelationError):
        await create_relation(
            db_session,
            organization_id=org1.id,
            source_matter_id=a.id,
            target_matter_id=a.id,
            relation_type="revokes",
            actor_id=u1.id,
        )

    # exact duplicate rejected
    with pytest.raises(RelationError):
        await create_relation(
            db_session,
            organization_id=org1.id,
            source_matter_id=a.id,
            target_matter_id=b.id,
            relation_type="rectifies",
            actor_id=u1.id,
        )

    # reverse loop rejected
    with pytest.raises(RelationError):
        await create_relation(
            db_session,
            organization_id=org1.id,
            source_matter_id=b.id,
            target_matter_id=a.id,
            relation_type="rectifies",
            actor_id=u1.id,
        )

    # cross-tenant relation rejected
    with pytest.raises(RelationError):
        await create_relation(
            db_session,
            organization_id=org1.id,
            source_matter_id=a.id,
            target_matter_id=c.id,
            relation_type="revokes",
            actor_id=u1.id,
        )

    # tenant isolation on read: org2 sees nothing about org1 matters
    rels_org2 = await list_relations_for_matter(db_session, org2.id, c.id)
    assert rels_org2["outgoing"] == [] and rels_org2["incoming"] == []

    # target side legal status (b was rectified by a)
    rels_b = await list_relations_for_matter(db_session, org1.id, b.id)
    assert len(rels_b["incoming"]) == 1
    flags = legal_status_flags(rels_b["incoming"])
    assert "rectifies" in flags and flags["rectifies"] is not None

    # deletion removes relation + stays tenant-safe
    await delete_relation(db_session, relation_id=rel.id, organization_id=org1.id, actor_id=u1.id)
    rem = await list_relations_for_matter(db_session, org1.id, b.id)
    assert rem["incoming"] == []


@pytest.mark.asyncio
async def test_relations_rows_persisted(db_session):
    org, u, _, mk = await _seed(db_session, "org-persist", "p@x", "P")
    a = mk("5")
    b = mk("6")
    await _flush_all(db_session)
    await db_session.refresh(a)
    await db_session.refresh(b)
    await create_relation(
        db_session,
        organization_id=org.id,
        source_matter_id=a.id,
        target_matter_id=b.id,
        relation_type="supersedes",
        actor_id=u.id,
    )
    rows = list(
        (await db_session.execute(__import__("sqlalchemy").select(MatterRelation))).scalars().all()
    )
    assert len(rows) == 1
    assert rows[0].relation_type == "supersedes"
    assert str(rows[0].organization_id) == str(org.id)
