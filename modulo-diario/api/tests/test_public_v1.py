"""Tests for the 5 public API v1 endpoints."""
import uuid
from datetime import date, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.main import app
from app.core.database import get_db
from app.models.enums import EditionStatus, EditionType


@pytest.fixture(autouse=True)
def override_db():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db] = lambda: mock_session
    yield mock_session
    app.dependency_overrides.clear()


def _make_edition(**kwargs):
    e = MagicMock()
    e.id = kwargs.get("id", uuid.uuid4())
    e.number = kwargs.get("number", 1)
    e.year = kwargs.get("year", 2026)
    e.type = kwargs.get("type", EditionType.NORMAL)
    e.title = kwargs.get("title", "Test Edition")
    e.subtitle = kwargs.get("subtitle", None)
    e.publication_date = kwargs.get("publication_date", date.today())
    e.verification_code = kwargs.get("verification_code", "VERIFY123")
    e.pdf_path = kwargs.get("pdf_path", "doc.pdf")
    e.pdf_hash = kwargs.get("pdf_hash", "abc123")
    e.immutability_hash = kwargs.get("immutability_hash", "def456")
    e.published_at = kwargs.get("published_at", datetime(2026, 1, 1))
    e.items = kwargs.get("items", [])
    e.signatures = kwargs.get("signatures", [])
    e.status = kwargs.get("status", EditionStatus.PUBLISHED)
    return e


def _make_signature():
    sig = MagicMock()
    sig.signed_at = datetime(2026, 1, 15)
    sig.certificate_info = {
        "subject": "CN=Test Cert",
        "serial": "ABCD",
        "thumbprint": "THMB",
    }
    return sig


def _make_item(edition, matter=None):
    item = MagicMock()
    item.id = uuid.uuid4()
    item.position = 0
    item.section_title = "Section 1"
    item.matter = matter or _make_matter()
    item.matter_id = item.matter.id
    return item


def _make_matter(**kwargs):
    m = MagicMock()
    m.id = kwargs.get("id", uuid.uuid4())
    m.title = kwargs.get("title", "Test Matter")
    m.summary = kwargs.get("summary", "Summary text")
    m.content_html = kwargs.get("content_html", "<p>Content</p>")
    m.status = kwargs.get("status", "published")
    m.published_at = kwargs.get("published_at", datetime(2026, 1, 1))
    m.act_type = _make_act_type() if kwargs.get("act_type", True) else None
    m.org_unit = _make_org_unit() if kwargs.get("org_unit", True) else None
    m.author = _make_author() if kwargs.get("author", True) else None
    m.attachments = kwargs.get("attachments", [])
    return m


def _make_act_type():
    at = MagicMock()
    at.name = "Decreto"
    return at


def _make_org_unit():
    ou = MagicMock()
    ou.abbreviation = "SEFAZ"
    return ou


def _make_author():
    a = MagicMock()
    a.name = "Author Name"
    return a


class _FakeScalarResult:
    """Mimics SQLAlchemy ScalarResult: iterable and has .all()."""
    def __init__(self, items):
        self._items = list(items)

    def all(self):
        return self._items

    def __iter__(self):
        return iter(self._items)

    def __next__(self):
        raise StopIteration


def _mock_result(items):
    r = MagicMock()
    r.scalars.return_value = _FakeScalarResult(items)
    return r


# ── List Editions ─────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_v1_list_editions(client, override_db):
    mock_db = override_db
    edition = _make_edition()
    mock_db.execute.side_effect = [
        _mock_result([edition]),
        _mock_result([edition]),
    ]

    response = await client.get("/api/public/v1/editions")
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "pagination" in data
    assert len(data["data"]) == 1
    assert data["data"][0]["title"] == "Test Edition"


@pytest.mark.anyio
async def test_v1_list_editions_empty(client, override_db):
    mock_db = override_db
    mock_db.execute.side_effect = [
        _mock_result([]),
        _mock_result([]),
    ]

    response = await client.get("/api/public/v1/editions")
    assert response.status_code == 200
    data = response.json()
    assert data["data"] == []


@pytest.mark.anyio
async def test_v1_list_editions_with_filters(client, override_db):
    mock_db = override_db
    mock_db.execute.side_effect = [
        _mock_result([]),
        _mock_result([]),
    ]

    response = await client.get(
        "/api/public/v1/editions?year=2026&type=normal&search=teste&page=0&page_size=10"
    )
    assert response.status_code == 200
    data = response.json()
    assert "data" in data


# ── Get Edition ───────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_v1_get_edition(client, override_db):
    mock_db = override_db
    edition = _make_edition()
    signature = _make_signature()
    edition.signatures = [signature]
    item = _make_item(edition)
    item.position = 0
    edition.items = [item]

    r = MagicMock()
    r.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = r

    response = await client.get(f"/api/public/v1/editions/{edition.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(edition.id)
    assert data["title"] == "Test Edition"
    assert "items" in data
    assert "signatures" in data


@pytest.mark.anyio
async def test_v1_get_edition_by_year_number(client, override_db):
    mock_db = override_db
    edition = _make_edition(year=2026, number=1)
    item = _make_item(edition)
    edition.items = [item]

    r = MagicMock()
    r.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = r

    response = await client.get("/api/public/v1/editions/2026/1")
    assert response.status_code == 200
    data = response.json()
    assert data["year"] == 2026
    assert data["number"] == 1
    assert data["title"] == "Test Edition"


@pytest.mark.anyio
async def test_v1_get_edition_not_found(client, override_db):
    mock_db = override_db
    r = MagicMock()
    r.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = r

    response = await client.get(f"/api/public/v1/editions/{uuid.uuid4()}")
    assert response.status_code == 404


# ── List Matters ──────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_v1_list_matters(client, override_db):
    mock_db = override_db
    matter = _make_matter()
    mock_db.execute.side_effect = [
        _mock_result([matter]),
        _mock_result([matter]),
    ]

    response = await client.get("/api/public/v1/matters")
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "pagination" in data
    assert len(data["data"]) == 1


@pytest.mark.anyio
async def test_v1_list_matters_with_filters(client, override_db):
    mock_db = override_db
    mock_db.execute.side_effect = [
        _mock_result([]),
        _mock_result([]),
    ]

    response = await client.get(
        "/api/public/v1/matters?q=test&act_type=Decreto&org_unit=SEFAZ&year=2026"
    )
    assert response.status_code == 200


# ── Get Matter ────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_v1_get_matter(client, override_db):
    mock_db = override_db
    matter = _make_matter()
    r = MagicMock()
    r.scalar_one_or_none.return_value = matter
    mock_db.execute.return_value = r

    response = await client.get(f"/api/public/v1/matters/{matter.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(matter.id)
    assert data["title"] == "Test Matter"
    assert "attachments" in data


@pytest.mark.anyio
async def test_v1_get_matter_not_found(client, override_db):
    mock_db = override_db
    r = MagicMock()
    r.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = r

    response = await client.get(f"/api/public/v1/matters/{uuid.uuid4()}")
    assert response.status_code == 404


# ── Verify ────────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_v1_verify_valid(client, override_db):
    mock_db = override_db
    edition = _make_edition()
    sig = _make_signature()
    edition.signatures = [sig]
    r = MagicMock()
    r.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = r

    response = await client.get(f"/api/public/v1/verify/{edition.verification_code}")
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True
    assert data["message"] == "Document verified successfully"


@pytest.mark.anyio
async def test_v1_verify_not_found(client, override_db):
    mock_db = override_db
    r = MagicMock()
    r.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = r

    response = await client.get("/api/public/v1/verify/NONEXIST")
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is False
