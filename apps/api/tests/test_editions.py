"""Tests for the 14 editions endpoints."""
import uuid
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.main import app
from app.core.auth import get_current_user, require_roles as _require_roles
from app.core.database import get_db
from app.models.enums import EditionStatus, EditionType


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def override_db_and_auth():
    """Override get_db and get_current_user for all tests."""
    mock_session = AsyncMock()

    # Make refresh() populate id and timestamps for newly created objects.
    # Accepts attribute_names (usado nos endpoints para refresh cirurgico).
    async def _refresh(obj, attribute_names=None):
        if not obj.id:
            obj.id = uuid.uuid4()
        if not obj.created_at:
            obj.created_at = datetime.now(timezone.utc)
        if not obj.updated_at:
            obj.updated_at = datetime.now(timezone.utc)
    mock_session.refresh.side_effect = _refresh

    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()
    mock_user.organization_id = uuid.uuid4()
    mock_user.email = "test@example.com"
    mock_user.name = "Test User"
    mock_user.is_active = True
    mock_role = MagicMock()
    mock_role.name = "ADMIN"
    mock_ur = MagicMock()
    mock_ur.role = mock_role
    mock_user.user_roles = [mock_ur]

    app.dependency_overrides[get_db] = lambda: mock_session
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield mock_session
    app.dependency_overrides.clear()


def _make_edition(*, status: EditionStatus = EditionStatus.DRAFT, pdf_path=None, pdf_hash=None):
    e = MagicMock()
    e.id = uuid.uuid4()
    e.number = 1
    e.year = 2026
    e.type = EditionType.NORMAL
    e.title = "Test Edition"
    e.subtitle = None
    e.publication_date = date.today()
    e.status = status
    e.created_by = uuid.uuid4()
    e.published_at = None
    e.created_at = datetime(2026, 1, 1)
    e.updated_at = datetime(2026, 1, 1)
    e.items = []
    e.signatures = []
    e.pdf_path = pdf_path
    e.pdf_hash = pdf_hash
    e.verification_code = None
    e.immutability_hash = None
    e.can_edit = MagicMock(return_value=(status in (EditionStatus.DRAFT, EditionStatus.SCHEDULED)))
    e.change_status = MagicMock()
    e.generate_verification_code = MagicMock()
    e.compute_immutability_hash = MagicMock(return_value="abc123hash")
    e.published_by = None
    return e


def _make_matter():
    m = MagicMock()
    m.id = uuid.uuid4()
    m.title = "Test Matter"
    m.status = "approved"
    return m


def _make_item(edition_id, matter):
    item = MagicMock()
    item.id = uuid.uuid4()
    item.edition_id = edition_id
    item.matter_id = matter.id
    item.matter = matter
    item.section_title = None
    item.position = 0
    item.page_number = None
    return item


def _make_signature(edition_id):
    sig = MagicMock()
    sig.id = uuid.uuid4()
    sig.signed_at = datetime(2026, 1, 15)
    sig.certificate_info = {
        "subject": "CN=Test Cert",
        "serial": "ABCD1234",
        "thumbprint": "THUMB1234",
        "issuer": "CN=Test CA",
        "valid_from": "2026-01-01",
        "valid_to": "2027-01-01",
    }
    return sig


# ── Create ────────────────────────────────────────────────────────────────────


def _make_setting(key: str, value: str):
    s = MagicMock()
    s.key = key
    s.value = value
    return s


@patch("app.api.v1.editions.log_audit_event", new_callable=AsyncMock)
@patch("app.api.v1.editions.capture_request_info", return_value={"ip_address": "127.0.0.1", "user_agent": ""})
@pytest.mark.anyio
async def test_create_edition(mock_capture, mock_audit, client, override_db_and_auth):
    mock_db = override_db_and_auth
    # 1) auto_numbering setting (not found -> defaults to True)
    # 2) MAX(number) query -> 0
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_result.scalar.return_value = 0
    mock_db.execute.return_value = mock_result

    payload = {
        "year": 2026,
        "type": "normal",
        "title": "Edicao Teste",
        "publication_date": "2026-05-01",
    }
    response = await client.post("/api/v1/editions", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Edicao Teste"
    assert data["status"] == "draft"
    assert data["number"] == 1


@patch("app.api.v1.editions.log_audit_event", new_callable=AsyncMock)
@patch("app.api.v1.editions.capture_request_info", return_value={"ip_address": "127.0.0.1", "user_agent": ""})
@pytest.mark.anyio
async def test_create_edition_auto_number_ignores_client_number(
    mock_capture, mock_audit, client, override_db_and_auth
):
    mock_db = override_db_and_auth
    r_setting = MagicMock()
    r_setting.scalar_one_or_none.return_value = _make_setting("edition.auto_numbering", "true")
    r_max = MagicMock()
    r_max.scalar.return_value = 41
    mock_db.execute.side_effect = [r_setting, r_max]

    payload = {
        "number": 1,
        "year": 2026,
        "type": "normal",
        "title": "Diário Oficial - Edição 01",
        "publication_date": "2026-05-01",
    }
    response = await client.post("/api/v1/editions", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["number"] == 42
    # default-pattern title is regenerated to match server-assigned number
    assert data["title"] == "Diário Oficial - Edição 42"


@patch("app.api.v1.editions.log_audit_event", new_callable=AsyncMock)
@patch("app.api.v1.editions.capture_request_info", return_value={"ip_address": "127.0.0.1", "user_agent": ""})
@pytest.mark.anyio
async def test_create_edition_auto_number_generates_title(
    mock_capture, mock_audit, client, override_db_and_auth
):
    mock_db = override_db_and_auth
    r_setting = MagicMock()
    r_setting.scalar_one_or_none.return_value = None
    r_max = MagicMock()
    r_max.scalar.return_value = 4
    mock_db.execute.side_effect = [r_setting, r_max]

    payload = {
        "year": 2026,
        "type": "normal",
        "publication_date": "2026-05-01",
    }
    response = await client.post("/api/v1/editions", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["number"] == 5
    assert data["title"] == "Diário Oficial - Edição 05"


@patch("app.api.v1.editions.log_audit_event", new_callable=AsyncMock)
@patch("app.api.v1.editions.capture_request_info", return_value={"ip_address": "127.0.0.1", "user_agent": ""})
@pytest.mark.anyio
async def test_create_edition_manual_number(mock_capture, mock_audit, client, override_db_and_auth):
    mock_db = override_db_and_auth
    r_setting = MagicMock()
    r_setting.scalar_one_or_none.return_value = _make_setting("edition.auto_numbering", "false")
    r_dup = MagicMock()
    r_dup.scalar_one_or_none.return_value = None
    mock_db.execute.side_effect = [r_setting, r_dup]

    payload = {
        "number": 99,
        "year": 2026,
        "type": "normal",
        "title": "Edicao Manual",
        "publication_date": "2026-05-01",
    }
    response = await client.post("/api/v1/editions", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["number"] == 99
    assert data["title"] == "Edicao Manual"


@patch("app.api.v1.editions.log_audit_event", new_callable=AsyncMock)
@patch("app.api.v1.editions.capture_request_info", return_value={"ip_address": "127.0.0.1", "user_agent": ""})
@pytest.mark.anyio
async def test_create_edition_manual_number_required(
    mock_capture, mock_audit, client, override_db_and_auth
):
    mock_db = override_db_and_auth
    r_setting = MagicMock()
    r_setting.scalar_one_or_none.return_value = _make_setting("edition.auto_numbering", "false")
    mock_db.execute.side_effect = [r_setting]

    payload = {
        "year": 2026,
        "type": "normal",
        "title": "Sem Numero",
        "publication_date": "2026-05-01",
    }
    response = await client.post("/api/v1/editions", json=payload)
    assert response.status_code == 422


@patch("app.api.v1.editions.log_audit_event", new_callable=AsyncMock)
@patch("app.api.v1.editions.capture_request_info", return_value={"ip_address": "127.0.0.1", "user_agent": ""})
@pytest.mark.anyio
async def test_create_edition_duplicate(mock_capture, mock_audit, client, override_db_and_auth):
    mock_db = override_db_and_auth
    r_setting = MagicMock()
    r_setting.scalar_one_or_none.return_value = _make_setting("edition.auto_numbering", "false")
    r_dup = MagicMock()
    r_dup.scalar_one_or_none.return_value = _make_edition()
    mock_db.execute.side_effect = [r_setting, r_dup]

    payload = {
        "number": 1,
        "year": 2026,
        "type": "normal",
        "title": "Edicao Teste",
        "publication_date": "2026-05-01",
    }
    response = await client.post("/api/v1/editions", json=payload)
    assert response.status_code == 409


# ── Next Number ───────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_get_next_edition_number(client, override_db_and_auth):
    mock_db = override_db_and_auth
    r_max = MagicMock()
    r_max.scalar.return_value = 7
    r_setting = MagicMock()
    r_setting.scalar_one_or_none.return_value = None
    mock_db.execute.side_effect = [r_max, r_setting]

    response = await client.get("/api/v1/editions/next-number?year=2026&type=normal")
    assert response.status_code == 200
    data = response.json()
    assert data["next_number"] == 8
    assert data["year"] == 2026
    assert data["auto_numbering"] is True

# ── List ──────────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_list_editions(client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [edition]
    mock_db.execute.return_value = mock_result

    response = await client.get("/api/v1/editions")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["title"] == "Test Edition"


@pytest.mark.anyio
async def test_list_editions_filtered(client, override_db_and_auth):
    mock_db = override_db_and_auth
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result

    response = await client.get("/api/v1/editions?year=2026&status=draft&type=normal&skip=0&limit=10")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


# ── Get ───────────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_get_edition(client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    response = await client.get(f"/api/v1/editions/{edition.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(edition.id)


@pytest.mark.anyio
async def test_get_edition_not_found(client, override_db_and_auth):
    mock_db = override_db_and_auth
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    response = await client.get(f"/api/v1/editions/{uuid.uuid4()}")
    assert response.status_code == 404


# ── Update ────────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_update_edition(client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition(status=EditionStatus.DRAFT)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    payload = {"title": "Updated Title"}
    response = await client.patch(f"/api/v1/editions/{edition.id}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(edition.id)


@pytest.mark.anyio
async def test_update_edition_not_editable(client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition(status=EditionStatus.PUBLISHED)
    edition.can_edit.return_value = False
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    payload = {"title": "Updated Title"}
    response = await client.patch(f"/api/v1/editions/{edition.id}", json=payload)
    assert response.status_code == 422


# ── List Items ────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_list_items(client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition()
    matter = _make_matter()
    item = _make_item(edition.id, matter)
    edition.items = [item]
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    response = await client.get(f"/api/v1/editions/{edition.id}/items")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1


# ── Add Item ──────────────────────────────────────────────────────────────────


@patch("app.api.v1.editions.log_audit_event", new_callable=AsyncMock)
@patch("app.api.v1.editions.capture_request_info", return_value={"ip_address": "127.0.0.1", "user_agent": ""})
@patch("app.api.v1.editions.select")
@pytest.mark.anyio
async def test_add_item_to_edition(mock_select, mock_capture, mock_audit, client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition()
    matter = _make_matter()

    r1 = MagicMock(); r1.scalar_one_or_none.return_value = edition
    r2 = MagicMock(); r2.scalar_one_or_none.return_value = matter
    r3 = MagicMock(); r3.scalar_one_or_none.return_value = None
    r4 = MagicMock(); r4.scalar.return_value = 0
    mock_db.execute.side_effect = [r1, r2, r3, r4]

    payload = {"matter_id": str(matter.id)}
    response = await client.post(f"/api/v1/editions/{edition.id}/items", json=payload)
    assert response.status_code == 201


@patch("app.api.v1.editions.select")
@pytest.mark.anyio
async def test_add_item_matter_not_found(mock_select, client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition()
    r1 = MagicMock(); r1.scalar_one_or_none.return_value = edition
    r2 = MagicMock(); r2.scalar_one_or_none.return_value = None
    mock_db.execute.side_effect = [r1, r2]

    payload = {"matter_id": str(uuid.uuid4())}
    response = await client.post(f"/api/v1/editions/{edition.id}/items", json=payload)
    assert response.status_code == 404


@patch("app.api.v1.editions.select")
@pytest.mark.anyio
async def test_add_item_edition_not_editable(mock_select, client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition(status=EditionStatus.PUBLISHED)
    r1 = MagicMock(); r1.scalar_one_or_none.return_value = edition
    mock_db.execute.side_effect = [r1]

    payload = {"matter_id": str(uuid.uuid4())}
    response = await client.post(f"/api/v1/editions/{edition.id}/items", json=payload)
    assert response.status_code == 422


# ── Reorder Items ─────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_reorder_items(client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition()
    matter = _make_matter()
    item = _make_item(edition.id, matter)
    edition.items = [item]
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    payload = {"items": [{"id": str(item.id), "position": 2}]}
    response = await client.patch(f"/api/v1/editions/{edition.id}/items/reorder", json=payload)
    assert response.status_code == 200


@pytest.mark.anyio
async def test_reorder_items_not_editable(client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition(status=EditionStatus.PUBLISHED)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    payload = {"items": []}
    response = await client.patch(f"/api/v1/editions/{edition.id}/items/reorder", json=payload)
    assert response.status_code == 422


# ── Remove Item ───────────────────────────────────────────────────────────────


@patch("app.api.v1.editions.log_audit_event", new_callable=AsyncMock)
@patch("app.api.v1.editions.capture_request_info", return_value={"ip_address": "127.0.0.1", "user_agent": ""})
@pytest.mark.anyio
async def test_remove_item(mock_capture, mock_audit, client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition()
    matter = _make_matter()
    item = _make_item(edition.id, matter)
    edition.items = [item]

    r1 = MagicMock(); r1.scalar_one_or_none.return_value = edition
    r2 = MagicMock(); r2.scalar_one_or_none.return_value = item
    mock_db.execute.side_effect = [r1, r2]

    response = await client.delete(f"/api/v1/editions/{edition.id}/items/{item.id}")
    assert response.status_code == 204


@patch("app.api.v1.editions.log_audit_event", new_callable=AsyncMock)
@patch("app.api.v1.editions.capture_request_info", return_value={"ip_address": "127.0.0.1", "user_agent": ""})
@pytest.mark.anyio
async def test_remove_item_not_found(mock_capture, mock_audit, client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition()
    r1 = MagicMock(); r1.scalar_one_or_none.return_value = edition
    r2 = MagicMock(); r2.scalar_one_or_none.return_value = None
    mock_db.execute.side_effect = [r1, r2]

    response = await client.delete(f"/api/v1/editions/{edition.id}/items/{uuid.uuid4()}")
    assert response.status_code == 404


# ── Close Edition ─────────────────────────────────────────────────────────────


@patch("app.api.v1.editions.log_audit_event", new_callable=AsyncMock)
@patch("app.api.v1.editions.capture_request_info", return_value={"ip_address": "127.0.0.1", "user_agent": ""})
@pytest.mark.anyio
async def test_close_edition(mock_capture, mock_audit, client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition(status=EditionStatus.SCHEDULED)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    response = await client.post(f"/api/v1/editions/{edition.id}/close")
    assert response.status_code == 200
    edition.change_status.assert_called_once_with(EditionStatus.CLOSED)


# ── Reopen Edition ────────────────────────────────────────────────────────────


@patch("app.api.v1.editions.log_audit_event", new_callable=AsyncMock)
@patch("app.api.v1.editions.capture_request_info", return_value={"ip_address": "127.0.0.1", "user_agent": ""})
@pytest.mark.anyio
async def test_reopen_edition(mock_capture, mock_audit, client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition(status=EditionStatus.CLOSED)
    edition.signatures = []
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    response = await client.post(f"/api/v1/editions/{edition.id}/reopen")
    assert response.status_code == 200


@pytest.mark.anyio
async def test_reopen_edition_with_signatures(client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition(status=EditionStatus.CLOSED)
    edition.signatures = [_make_signature(edition.id)]
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    response = await client.post(f"/api/v1/editions/{edition.id}/reopen")
    assert response.status_code == 422


@pytest.mark.anyio
async def test_reopen_edition_not_closed(client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition(status=EditionStatus.DRAFT)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    response = await client.post(f"/api/v1/editions/{edition.id}/reopen")
    assert response.status_code == 422


# ── Generate PDF ──────────────────────────────────────────────────────────────


@patch("app.services.edition_pdf.generate_edition_pdf_sync")
@pytest.mark.anyio
async def test_generate_edition_pdf(mock_pdf_sync, client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition(status=EditionStatus.CLOSED)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result
    mock_pdf_sync.return_value = {"filename": "test.pdf", "sha256": "abc123"}

    response = await client.post(f"/api/v1/editions/{edition.id}/generate-pdf")
    assert response.status_code == 200
    data = response.json()
    assert data["filename"] == "test.pdf"
    assert data["sha256"] == "abc123"


@pytest.mark.anyio
async def test_generate_pdf_not_closed(client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition(status=EditionStatus.DRAFT)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    response = await client.post(f"/api/v1/editions/{edition.id}/generate-pdf")
    assert response.status_code == 422


@pytest.mark.anyio
async def test_generate_pdf_already_generated(client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition(status=EditionStatus.CLOSED, pdf_path="existing.pdf")
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    response = await client.post(f"/api/v1/editions/{edition.id}/generate-pdf")
    assert response.status_code == 409


# ── Sign ──────────────────────────────────────────────────────────────────────


@patch("app.api.v1.editions.log_audit_event", new_callable=AsyncMock)
@patch("app.api.v1.editions.capture_request_info", return_value={"ip_address": "127.0.0.1", "user_agent": ""})
@pytest.mark.anyio
@patch("builtins.open")
@patch("os.path.exists", return_value=True)
@patch("os.path.join", return_value="/tmp/mock.pdf")
@patch("app.core.storage.storage")
@patch("httpx.AsyncClient")
@pytest.mark.anyio
async def test_sign_edition(
    mock_http, mock_storage, mock_join, mock_exists, mock_open,
    mock_capture, mock_audit, client, override_db_and_auth, tmp_path,
):
    mock_db = override_db_and_auth
    edition = _make_edition(status=EditionStatus.PDF_GENERATED, pdf_path="test.pdf", pdf_hash="hash123")
    edition.signatures = []

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    mock_file = MagicMock()
    mock_file.read.return_value = b"fake-pdf-bytes"
    mock_open.return_value.__enter__.return_value = mock_file

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "signed_pdf_base64": "c2lnbmVk",
        "sha256_signed": "signedhash",
        "sha256_original": "orighash",
        "certificate_subject": "CN=Test",
        "certificate_serial": "12345",
        "certificate_thumbprint": "thumb",
        "certificate_issuer": "CN=CA",
        "valid_from": "2026-01-01",
        "valid_to": "2027-01-01",
        "signature_format": "PAdES",
    }
    mock_http_client = AsyncMock()
    mock_http_client.__aenter__.return_value = mock_http_client
    mock_http_client.__aexit__.return_value = None
    mock_http_client.post.return_value = mock_resp
    mock_http.return_value = mock_http_client

    mock_storage.store = AsyncMock()

    payload = {"reason": "Test Sign", "location": "Brasilia", "visible": True}
    response = await client.post(f"/api/v1/editions/{edition.id}/sign", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "verification_code" in data


@pytest.mark.anyio
async def test_sign_edition_not_pdf_generated(client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition(status=EditionStatus.DRAFT)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    response = await client.post(f"/api/v1/editions/{edition.id}/sign", json={})
    assert response.status_code == 422


# ── Validate Signature ────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_validate_signature(client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition(status=EditionStatus.SIGNED, pdf_hash="hash123")
    edition.compute_immutability_hash.return_value = edition.immutability_hash or "hash"
    edition.immutability_hash = "hash"
    sig = _make_signature(edition.id)
    edition.signatures = [sig]
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    response = await client.post(f"/api/v1/editions/{edition.id}/validate-signature")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data


@pytest.mark.anyio
async def test_validate_signature_no_signatures(client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition()
    edition.signatures = []
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    response = await client.post(f"/api/v1/editions/{edition.id}/validate-signature")
    assert response.status_code == 404


# ── Publish ───────────────────────────────────────────────────────────────────


@patch("app.api.v1.editions.log_audit_event", new_callable=AsyncMock)
@patch("app.api.v1.editions.capture_request_info", return_value={"ip_address": "127.0.0.1", "user_agent": ""})
@patch("app.services.search_indexer.get_search_provider")
@pytest.mark.anyio
async def test_publish_edition(mock_search, mock_capture, mock_audit, client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition(status=EditionStatus.SIGNED, pdf_hash="hash123")
    sig = _make_signature(edition.id)
    edition.signatures = [sig]
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    mock_indexer = MagicMock()
    mock_indexer.index_matter = AsyncMock()
    mock_search.return_value = mock_indexer

    response = await client.post(f"/api/v1/editions/{edition.id}/publish")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "published"
    assert "verification_code" in data


@pytest.mark.anyio
async def test_publish_edition_not_signed(client, override_db_and_auth):
    mock_db = override_db_and_auth
    edition = _make_edition(status=EditionStatus.DRAFT)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = edition
    mock_db.execute.return_value = mock_result

    response = await client.post(f"/api/v1/editions/{edition.id}/publish")
    assert response.status_code == 422
