"""Testes das Fases 2 e 3 (fila, classificação, montagem, validação, PII, slugs)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.auth import get_current_user
from app.core.database import get_db
from app.core.pii import mask_cpf_cnpj
from app.main import app
from app.models.act_type import ActType
from app.models.edition import Edition
from app.models.edition_item import EditionItem
from app.models.enums import EditionStatus, EditionType, MatterStatus
from app.models.matter import Matter
from app.models.organization import Organization
from app.models.user import User
from app.services.edition_classification import section_for_matter
from app.services.matter_slug import matter_slug, parse_slug

# ── Unit: classification / slug / PII ───────────────────────────────────────


class _Type:
    def __init__(self, name, config=None):
        self.name = name
        self.config = config


class _Matter:
    def __init__(self, title="", act_number=None, act_year=None):
        self.title = title
        self.act_number = act_number
        self.act_year = act_year


def test_classify_by_act_type():
    assert section_for_matter(_Matter(), _Type("Decreto")) == "Atos do Poder Executivo"
    assert section_for_matter(_Matter(), _Type("Portaria")) == "Portarias"
    assert section_for_matter(_Matter(), _Type("Licitação")) == "Licitações"
    assert section_for_matter(_Matter(), _Type("Contrato")) == "Contratos"
    assert section_for_matter(_Matter(), _Type("Ata de Registro")) == "Atas de Registro de Preços"
    assert section_for_matter(_Matter(), _Type("Outros")) == "Outros"


def test_classify_config_override_wins():
    t = _Type("Decreto", {"section": "Atos Oficiais"})
    assert section_for_matter(_Matter(), t) == "Atos Oficiais"


def test_classify_falls_back_to_title():
    assert section_for_matter(_Matter(title="EXTRATO DE CONTRATO 87"), None) == "Contratos"


def test_matter_slug_roundtrip():
    m = _Matter(act_number="214", act_year=2026)
    slug = matter_slug(m, _Type("Decreto"))
    assert slug == "decreto-214-2026"
    assert parse_slug(slug) == ("decreto", "214", 2026)


def test_mask_cpf_cnpj():
    assert mask_cpf_cnpj("CNPJ 12.345.678/0001-90 fim") == "CNPJ **.***.***/****-90 fim"
    assert mask_cpf_cnpj("CPF 123.456.789-09") == "CPF ***.***.***-09"


# ── Integration: queue / auto-fill / auto-order / validation ────────────────


class _RoleName:
    def __init__(self, name):
        self.name = name


class _RoleObj:
    def __init__(self, name):
        self.role = _RoleName(name)


class _UserProxy:
    def __init__(self, user, roles):
        self._user = user
        self._roles = [_RoleObj(r) for r in roles]

    @property
    def id(self):
        return self._user.id

    @property
    def organization_id(self):
        return self._user.organization_id

    @property
    def email(self):
        return self._user.email

    @property
    def name(self):
        return self._user.name

    @property
    def user_roles(self):
        return self._roles


@pytest_asyncio.fixture
async def ctx(db_session):
    org = Organization(name="Prefeitura F23", slug="pf-f23", cnpj="12345678000197")
    db_session.add(org)
    await db_session.flush()

    admin = User(
        name="Admin", email=f"admin_{uuid.uuid4().hex[:8]}@test",
        organization_id=org.id, is_active=True,
    )
    db_session.add(admin)
    await db_session.flush()

    decreto = ActType(name="Decreto", config=None)
    portaria = ActType(name="Portaria", config=None)
    db_session.add_all([decreto, portaria])
    await db_session.flush()

    class C:
        pass

    C.org = org
    C.admin = _UserProxy(admin, ["ADMIN", "REVISOR"])
    C.decreto = decreto
    C.portaria = portaria
    C.raw_admin = admin
    yield C
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def api_client(ctx, db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        def bind(user):
            app.dependency_overrides[get_db] = lambda: db_session
            app.dependency_overrides[get_current_user] = lambda: user
            return ac

        yield bind


async def _approved(db_session, ctx, *, at, number, title):
    m = Matter(
        organization_id=ctx.org.id,
        act_type_id=at.id,
        title=title,
        content_html="<p>Corpo do ato</p>",
        plain_text="Corpo do ato",
        status=MatterStatus.APPROVED,
        workflow_status="aprovado",
        author_id=ctx.raw_admin.id,
        act_number=number,
        act_year=2026,
        content_mode="rich_text",
    )
    db_session.add(m)
    await db_session.flush()
    return m


async def _edition(db_session, ctx):
    ed = Edition(
        organization_id=ctx.org.id, number=1, year=2026, type=EditionType.NORMAL,
        title="Edição teste", publication_date=date(2026, 9, 23),
        status=EditionStatus.DRAFT, created_by=ctx.raw_admin.id,
    )
    db_session.add(ed)
    await db_session.flush()
    return ed


async def test_publication_queue_lists_approved(api_client, ctx, db_session):
    await _approved(db_session, ctx, at=ctx.decreto, number="1", title="DECRETO Nº 1/2026")
    await _approved(db_session, ctx, at=ctx.portaria, number="2", title="PORTARIA Nº 2/2026")
    client = api_client(ctx.admin)
    resp = await client.get("/api/v1/editions/publication-queue")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total"] == 2
    sections = {i["suggested_section"] for i in data["items"]}
    assert "Atos do Poder Executivo" in sections
    assert "Portarias" in sections


async def test_auto_fill_classifies_and_orders(api_client, ctx, db_session):
    await _approved(db_session, ctx, at=ctx.portaria, number="9", title="PORTARIA Nº 9/2026")
    await _approved(db_session, ctx, at=ctx.decreto, number="1", title="DECRETO Nº 1/2026")
    ed = await _edition(db_session, ctx)
    client = api_client(ctx.admin)

    resp = await client.post(f"/api/v1/editions/{ed.id}/auto-fill")
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    assert len(items) == 2
    # Decreto section comes before Portarias in the editorial order.
    assert items[0]["section_title"] == "Atos do Poder Executivo"
    assert items[1]["section_title"] == "Portarias"
    assert [i["position"] for i in items] == [0, 1]


async def test_auto_order_reorders(api_client, ctx, db_session):
    p = await _approved(db_session, ctx, at=ctx.portaria, number="9", title="PORTARIA Nº 9/2026")
    d = await _approved(db_session, ctx, at=ctx.decreto, number="1", title="DECRETO Nº 1/2026")
    ed = await _edition(db_session, ctx)
    # Deliberately inverted order.
    db_session.add_all([
        EditionItem(edition_id=ed.id, matter_id=p.id, section_title="Portarias", position=0),
        EditionItem(
            edition_id=ed.id, matter_id=d.id,
            section_title="Atos do Poder Executivo", position=1,
        ),
    ])
    await db_session.flush()

    client = api_client(ctx.admin)
    resp = await client.post(f"/api/v1/editions/{ed.id}/auto-order")
    assert resp.status_code == 200, resp.text
    items = sorted(resp.json()["items"], key=lambda i: i["position"])
    assert items[0]["section_title"] == "Atos do Poder Executivo"
    assert items[1]["section_title"] == "Portarias"


async def test_validation_blocks_unapproved(api_client, ctx, db_session):
    # Draft matter (not approved) inserted into the edition.
    m = Matter(
        organization_id=ctx.org.id, act_type_id=ctx.decreto.id, title="DECRETO",
        content_html="<p>x</p>", plain_text="x", status=MatterStatus.DRAFT,
        workflow_status="rascunho", author_id=ctx.raw_admin.id,
        act_number="5", act_year=2026, content_mode="rich_text",
    )
    db_session.add(m)
    await db_session.flush()
    ed = await _edition(db_session, ctx)
    db_session.add(EditionItem(edition_id=ed.id, matter_id=m.id, position=0))
    await db_session.flush()

    client = api_client(ctx.admin)
    resp = await client.get(f"/api/v1/editions/{ed.id}/validation")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["ok"] is False
    codes = {c["code"] for c in data["checks"] if c["status"] == "error"}
    assert "all_approved" in codes
