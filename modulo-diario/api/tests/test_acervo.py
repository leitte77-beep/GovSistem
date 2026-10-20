"""Acervo de atos (etapa 1): numeração por entidade, consulta e exportação."""

from __future__ import annotations

import io
import uuid
from types import SimpleNamespace

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update

from app.core.auth import get_current_user
from app.core.database import get_db
from app.main import app
from app.models.act_type import ActType
from app.models.enums import MatterStatus
from app.models.matter import Matter
from app.models.org_unit import OrgUnit
from app.models.organization import Organization
from app.models.user import User
from app.services import document_numbering
from app.services.edition_classification import (
    matter_sort_key,
    section_for_matter,
    section_rank,
)


class _UserProxy:
    def __init__(self, user: User, roles: list[str]):
        self._user = user
        self.user_roles = [SimpleNamespace(role=SimpleNamespace(name=r)) for r in roles]

    def __getattr__(self, name):
        return getattr(self._user, name)


@pytest_asyncio.fixture
async def ctx(db_session):
    org = Organization(name="Prefeitura Acervo", slug="pf-acervo", cnpj="32345678000195")
    db_session.add(org)
    await db_session.flush()

    def user(label):
        return User(name=label, email=f"{label}_{uuid.uuid4().hex[:6]}@t", organization_id=org.id, is_active=True)

    admin_row, autor_row, outro_row = user("admin"), user("autor"), user("outro")
    camara = OrgUnit(organization_id=org.id, name="Câmara Municipal")
    prefeitura = OrgUnit(organization_id=org.id, name="Prefeitura Municipal")
    portaria = ActType(name="Portaria Acervo", description="", config=None)
    extrato = ActType(name="Extrato de Contrato Acervo", description="", config=None)
    db_session.add_all([admin_row, autor_row, outro_row, camara, prefeitura, portaria, extrato])
    await db_session.flush()

    yield SimpleNamespace(
        org=org,
        admin=_UserProxy(admin_row, ["ADMIN"]),
        autor=_UserProxy(autor_row, ["AUTOR"]),
        outro=_UserProxy(outro_row, ["AUTOR"]),
        camara=camara,
        prefeitura=prefeitura,
        portaria=portaria,
        extrato=extrato,
    )
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def api(ctx, db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        def bind(user):
            app.dependency_overrides[get_db] = lambda: db_session
            app.dependency_overrides[get_current_user] = lambda: user
            return ac

        yield bind


async def _create(client, *, act_type, unit, number, year=2026, title=None, summary="s"):
    resp = await client.post(
        "/api/v1/matters",
        json={
            "title": title or f"ATO {number}/{year}",
            "summary": summary,
            "act_type_id": str(act_type.id),
            "org_unit_id": str(unit.id) if unit else None,
            "act_number": number,
            "act_year": year,
            "content_html": "<p>Corpo do ato</p>",
            "content_mode": "rich_text",
        },
    )
    return resp


# ── Numeração por entidade ───────────────────────────────────────────────────


async def test_same_number_allowed_in_other_entity_blocked_in_same(api, ctx):
    client = api(ctx.admin)
    assert (await _create(client, act_type=ctx.portaria, unit=ctx.prefeitura, number="10")).status_code == 201
    assert (await _create(client, act_type=ctx.portaria, unit=ctx.camara, number="10")).status_code == 201

    dup = await _create(client, act_type=ctx.portaria, unit=ctx.prefeitura, number="10")
    assert dup.status_code == 409, dup.text
    assert "entidade" in dup.json()["detail"]["message"]


async def test_next_title_is_per_entity_and_year(api, ctx):
    client = api(ctx.admin)
    await _create(client, act_type=ctx.portaria, unit=ctx.prefeitura, number="235")
    await _create(client, act_type=ctx.portaria, unit=ctx.prefeitura, number="900", year=2025)
    await _create(client, act_type=ctx.portaria, unit=ctx.camara, number="4")

    def nxt(unit):
        return client.get(
            "/api/v1/matters/next-title",
            params={"act_type_id": str(ctx.portaria.id), "org_unit_id": str(unit.id), "year": 2026},
        )

    assert (await nxt(ctx.prefeitura)).json()["next_number"] == 236
    assert (await nxt(ctx.camara)).json()["next_number"] == 5


async def test_next_title_counts_drafts(api, ctx):
    # Dois rascunhos não podem receber o mesmo número sugerido.
    client = api(ctx.admin)
    await _create(client, act_type=ctx.portaria, unit=ctx.prefeitura, number="7")
    resp = await client.get(
        "/api/v1/matters/next-title",
        params={"act_type_id": str(ctx.portaria.id), "org_unit_id": str(ctx.prefeitura.id), "year": 2026},
    )
    assert resp.json()["next_number"] == 8


async def test_series_seeds_from_highest_used_number(api, ctx, db_session):
    client = api(ctx.admin)
    await _create(client, act_type=ctx.portaria, unit=ctx.prefeitura, number="235")
    issued = await document_numbering.next_in_series(
        db_session,
        organization_id=ctx.org.id,
        act_type_id=ctx.portaria.id,
        year=2026,
        org_unit_id=ctx.prefeitura.id,
    )
    assert issued == 236
    camara = await document_numbering.next_in_series(
        db_session,
        organization_id=ctx.org.id,
        act_type_id=ctx.portaria.id,
        year=2026,
        org_unit_id=ctx.camara.id,
    )
    assert camara == 1


# ── Consulta ─────────────────────────────────────────────────────────────────


async def test_folders_count_by_type_and_entity_order(api, ctx):
    client = api(ctx.admin)
    for n in ("1", "2", "3"):
        await _create(client, act_type=ctx.portaria, unit=ctx.prefeitura, number=n)
    await _create(client, act_type=ctx.extrato, unit=ctx.camara, number="42")

    data = (await client.get("/api/v1/acervo/pastas")).json()
    folders = {f["name"]: f for f in data["folders"]}
    assert folders["Portaria Acervo"]["total"] == 3
    assert folders["Portaria Acervo"]["family"] == "numerado"
    assert folders["Extrato de Contrato Acervo"]["family"] == "expediente"
    assert data["total"] == 4
    # Prefeitura primeiro, Câmara depois — a mesma ordem da edição.
    assert [e["name"] for e in data["entities"]] == ["Prefeitura Municipal", "Câmara Municipal"]
    assert 2026 in data["years"]

    camara_only = (await client.get("/api/v1/acervo/pastas", params={"org_unit_id": str(ctx.camara.id)})).json()
    assert {f["name"]: f["total"] for f in camara_only["folders"]}["Portaria Acervo"] == 0


async def test_list_filters_and_sorts_by_number(api, ctx):
    client = api(ctx.admin)
    for n in ("9", "10", "100"):
        await _create(client, act_type=ctx.portaria, unit=ctx.prefeitura, number=n)
    await _create(client, act_type=ctx.portaria, unit=ctx.camara, number="1", summary="Nomeia JOÃO DA SILVA")

    resp = await client.get(
        "/api/v1/acervo",
        params={"act_type_id": str(ctx.portaria.id), "org_unit_id": str(ctx.prefeitura.id), "order": "asc"},
    )
    body = resp.json()
    assert body["total"] == 3
    assert [i["act_number"] for i in body["items"]] == ["9", "10", "100"]
    assert body["items"][0]["status_label"] == "Rascunho"

    found = (await client.get("/api/v1/acervo", params={"q": "JOÃO"})).json()
    assert found["total"] == 1 and found["items"][0]["org_unit_name"] == "Câmara Municipal"

    familia = (await client.get("/api/v1/acervo", params={"family": "expediente"})).json()
    assert familia["total"] == 0


async def test_visibility_published_is_public_drafts_are_private(api, ctx, db_session):
    autor = api(ctx.autor)
    own = (await _create(autor, act_type=ctx.portaria, unit=ctx.prefeitura, number="1")).json()
    pub = (await _create(autor, act_type=ctx.portaria, unit=ctx.prefeitura, number="2")).json()
    await db_session.execute(
        update(Matter).where(Matter.id == uuid.UUID(pub["id"])).values(status=MatterStatus.PUBLISHED)
    )
    await db_session.flush()

    other = (await api(ctx.outro).get("/api/v1/acervo")).json()
    assert [i["id"] for i in other["items"]] == [pub["id"]]

    mine = (await api(ctx.autor).get("/api/v1/acervo")).json()
    assert {i["id"] for i in mine["items"]} == {own["id"], pub["id"]}


async def test_archived_hidden_unless_requested(api, ctx, db_session):
    client = api(ctx.admin)
    created = (await _create(client, act_type=ctx.portaria, unit=ctx.prefeitura, number="1")).json()
    await db_session.execute(
        update(Matter).where(Matter.id == uuid.UUID(created["id"])).values(status=MatterStatus.ARCHIVED)
    )
    await db_session.flush()
    assert (await client.get("/api/v1/acervo")).json()["total"] == 0
    assert (await client.get("/api/v1/acervo", params={"status": "archived"})).json()["total"] == 1


# ── Exportação ───────────────────────────────────────────────────────────────


async def test_export_xlsx_and_csv(api, ctx):
    from openpyxl import load_workbook

    client = api(ctx.admin)
    await _create(client, act_type=ctx.portaria, unit=ctx.prefeitura, number="12", summary="Concede férias")

    xlsx = await client.get("/api/v1/acervo/exportar", params={"formato": "xlsx"})
    assert xlsx.status_code == 200, xlsx.text
    sheet = load_workbook(io.BytesIO(xlsx.content)).active
    assert sheet["A4"].value == "Entidade"
    assert sheet["C5"].value == "12"
    assert sheet["G5"].value == "Concede férias"

    csv_resp = await client.get("/api/v1/acervo/exportar", params={"formato": "csv"})
    text = csv_resp.content.decode("utf-8-sig")
    assert text.splitlines()[0].startswith("Entidade;Tipo;Número")
    assert "Prefeitura Municipal;Portaria Acervo;12;2026" in text


async def test_export_rejects_unknown_format(api, ctx):
    resp = await api(ctx.admin).get("/api/v1/acervo/exportar", params={"formato": "exe"})
    assert resp.status_code == 422


# ── Edição: Prefeitura primeiro, Câmara depois ──────────────────────────────


def test_edition_sections_split_executive_before_legislative():
    portaria = SimpleNamespace(name="Portaria", config=None)
    decreto = SimpleNamespace(name="Decreto", config=None)
    prefeitura = SimpleNamespace(name="Prefeitura Municipal")
    camara = SimpleNamespace(name="Câmara Municipal")
    m = SimpleNamespace(title="", org_unit_id=None, act_number="1")

    assert section_for_matter(m, portaria, prefeitura) == "Portarias"
    assert section_for_matter(m, portaria, camara) == "Câmara Municipal — Portarias"
    # Até um decreto (primeira seção) da Câmara vem depois de tudo da Prefeitura.
    assert section_rank("Câmara Municipal — Atos do Poder Executivo") > section_rank("Outros")

    keys = sorted(
        [
            ("camara-portaria", matter_sort_key(m, portaria, camara)),
            ("pref-portaria", matter_sort_key(m, portaria, prefeitura)),
            ("camara-decreto", matter_sort_key(m, decreto, camara)),
            ("pref-decreto", matter_sort_key(m, decreto, prefeitura)),
        ],
        key=lambda kv: kv[1],
    )
    assert [k for k, _ in keys] == ["pref-decreto", "pref-portaria", "camara-decreto", "camara-portaria"]


# ── Etapa 2: somente registro, sugestões ────────────────────────────────────


async def test_registry_only_act_shows_as_registered_and_submit_sends_to_gazette(api, ctx):
    client = api(ctx.admin)
    resp = await client.post(
        "/api/v1/matters",
        json={
            "title": "PORTARIA Nº 01/2026",
            "act_type_id": str(ctx.portaria.id),
            "org_unit_id": str(ctx.prefeitura.id),
            "act_number": "01",
            "act_year": 2026,
            "content_html": "<p>Concede férias</p>",
            "gazette_publication": False,
        },
    )
    assert resp.status_code == 201, resp.text
    matter = resp.json()
    assert matter["gazette_publication"] is False

    registered = (await client.get("/api/v1/acervo", params={"status": "registered"})).json()
    assert registered["total"] == 1
    assert registered["items"][0]["status_label"] == "Registrado"
    assert (await client.get("/api/v1/acervo", params={"status": "draft"})).json()["total"] == 0

    # O número já está reservado: outro ato com o mesmo número é bloqueado.
    dup = await _create(client, act_type=ctx.portaria, unit=ctx.prefeitura, number="01")
    assert dup.status_code == 409

    sent = await client.post(f"/api/v1/matters/{matter['id']}/submit-review")
    assert sent.status_code == 200, sent.text
    assert sent.json()["gazette_publication"] is True
    assert sent.json()["status"] == "review"


async def test_suggestions_number_title_and_last_responsible(api, ctx):
    client = api(ctx.admin)
    resp = await client.post(
        "/api/v1/matters",
        json={
            "title": "PORTARIA Nº 07/2026",
            "act_type_id": str(ctx.portaria.id),
            "org_unit_id": str(ctx.prefeitura.id),
            "act_number": "07",
            "act_year": 2026,
            "content_html": "<p>x</p>",
            "responsible_name": "Maria Prefeita",
            "responsible_role": "Prefeita Municipal",
        },
    )
    assert resp.status_code == 201, resp.text

    s = (await client.get(
        "/api/v1/acervo/sugestoes",
        params={"act_type_id": str(ctx.portaria.id), "org_unit_id": str(ctx.prefeitura.id), "year": 2026},
    )).json()
    assert s["family"] == "numerado"
    assert s["act_number"] == "08"
    assert s["title"] == "PORTARIA ACERVO Nº 08/2026"
    assert s["responsible_name"] == "Maria Prefeita"
    assert s["responsible_source"] == "ultimo_ato"

    # Câmara: série própria e sem responsável conhecido.
    c = (await client.get(
        "/api/v1/acervo/sugestoes",
        params={"act_type_id": str(ctx.portaria.id), "org_unit_id": str(ctx.camara.id), "year": 2026},
    )).json()
    assert c["act_number"] == "01" and c["responsible_name"] is None

    # Expediente: o número é do processo, não do Diário.
    e = (await client.get(
        "/api/v1/acervo/sugestoes", params={"act_type_id": str(ctx.extrato.id), "org_unit_id": str(ctx.prefeitura.id)}
    )).json()
    assert e["family"] == "expediente" and e["act_number"] is None


async def test_suggestions_prefer_active_authority_of_entity(api, ctx, db_session):
    from app.models.authority import Authority

    db_session.add(Authority(organization_id=ctx.org.id, org_unit_id=ctx.camara.id, name="João Presidente",
                             role="Presidente da Câmara", is_active=True))
    await db_session.flush()
    s = (await api(ctx.admin).get(
        "/api/v1/acervo/sugestoes", params={"act_type_id": str(ctx.portaria.id), "org_unit_id": str(ctx.camara.id)}
    )).json()
    assert s["responsible_name"] == "João Presidente"
    assert s["responsible_source"] == "autoridade"


# ── Visualizar / baixar ─────────────────────────────────────────────────────


async def test_act_pdf_inline_and_download(api, ctx):
    client = api(ctx.admin)
    created = (await _create(client, act_type=ctx.portaria, unit=ctx.prefeitura, number="5")).json()

    inline = await client.get(f"/api/v1/acervo/{created['id']}/pdf")
    assert inline.status_code == 200, inline.text
    assert inline.content.startswith(b"%PDF")
    assert inline.headers["content-disposition"].startswith("inline")

    dl = await client.get(f"/api/v1/acervo/{created['id']}/pdf", params={"download": True})
    assert dl.headers["content-disposition"].startswith("attachment")
    assert "portaria-acervo-5-2026.pdf" in dl.headers["content-disposition"]


async def test_act_pdf_respects_visibility(api, ctx):
    draft = (await _create(api(ctx.autor), act_type=ctx.portaria, unit=ctx.prefeitura, number="1")).json()
    assert (await api(ctx.outro).get(f"/api/v1/acervo/{draft['id']}/pdf")).status_code == 404


async def test_edition_pdf_404_when_not_published(api, ctx):
    created = (await _create(api(ctx.admin), act_type=ctx.portaria, unit=ctx.prefeitura, number="2")).json()
    resp = await api(ctx.admin).get(f"/api/v1/acervo/{created['id']}/edicao")
    assert resp.status_code == 404
    assert "não foi publicado" in resp.json()["detail"]


async def test_matter_without_entity_defaults_to_executive(api, ctx):
    # Portaria 247/2026 entrou sem entidade e escapou da série da Prefeitura.
    client = api(ctx.admin)
    resp = await _create(client, act_type=ctx.portaria, unit=None, number="247")
    assert resp.status_code == 201, resp.text
    assert resp.json()["org_unit_id"] == str(ctx.prefeitura.id)
    s = (await client.get(
        "/api/v1/acervo/sugestoes",
        params={"act_type_id": str(ctx.portaria.id), "org_unit_id": str(ctx.prefeitura.id), "year": 2026},
    )).json()
    assert s["act_number"] == "248"


# ── Autoridades com entidade (cadastro do responsável) ───────────────────────


async def test_create_and_update_authority_with_org_unit(api, ctx):
    # Gravar com unidade devolvia 500 (carga preguiçosa após o commit) embora
    # salvasse — a tela mostrava erro e quem tentava de novo duplicava.
    client = api(ctx.admin)
    created = await client.post(
        "/api/v1/authorities",
        json={"name": "Maria Prefeita", "role": "Prefeita Municipal", "org_unit_id": str(ctx.prefeitura.id)},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["org_unit_name"] == "Prefeitura Municipal"

    moved = await client.patch(f"/api/v1/authorities/{body['id']}", json={"org_unit_id": str(ctx.camara.id)})
    assert moved.status_code == 200, moved.text
    assert moved.json()["org_unit_name"] == "Câmara Municipal"

    s = (await client.get(
        "/api/v1/acervo/sugestoes", params={"act_type_id": str(ctx.portaria.id), "org_unit_id": str(ctx.camara.id)}
    )).json()
    assert s["responsible_name"] == "Maria Prefeita" and s["responsible_source"] == "autoridade"


# ── Importar Word no Novo ato ───────────────────────────────────────────────


async def test_import_word_returns_html_without_saving(api, ctx, db_session):
    from sqlalchemy import func, select

    from tests.test_docx_html import _docx_with_text_box

    client = api(ctx.admin)
    resp = await client.post(
        "/api/v1/acervo/importar-word",
        files={"file": ("homologacao.docx", _docx_with_text_box(),
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["text_boxes"] == 1 and body["tables"] == 2
    assert "48.524,9700" in body["content_html"]
    assert (await db_session.scalar(select(func.count()).select_from(Matter))) == 0

    bad = await client.post(
        "/api/v1/acervo/importar-word", files={"file": ("x.pdf", b"%PDF-1.4 x", "application/pdf")}
    )
    assert bad.status_code in (400, 415, 422)
