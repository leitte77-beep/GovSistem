"""Tests for the 7 signing credential endpoints (ADMIN only)."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.main import app
from app.core.auth import get_current_user
from app.core.database import get_db


@pytest.fixture(autouse=True)
def override_auth_and_db():
    mock_session = AsyncMock()

    # Make refresh() populate id and timestamps for newly created objects
    async def _refresh(obj):
        if not obj.id:
            obj.id = uuid.uuid4()
        if not obj.created_at:
            obj.created_at = datetime.now(timezone.utc)
    mock_session.refresh.side_effect = _refresh

    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()
    mock_user.organization_id = uuid.uuid4()
    mock_user.email = "admin@test.com"
    mock_user.name = "Admin"
    mock_user.is_active = True
    mock_role = MagicMock()
    mock_role.name = "ADMIN"
    mock_ur = MagicMock()
    mock_ur.role = mock_role
    mock_user.user_roles = [mock_ur]

    app.dependency_overrides[get_db] = lambda: mock_session
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield mock_session, mock_user
    app.dependency_overrides.clear()


def _make_credential():
    c = MagicMock()
    c.id = uuid.uuid4()
    c.label = "My Cert"
    c.provider_type = "a1"
    c.certificate_serial = "ABCD1234"
    c.certificate_subject = "CN=Test"
    c.certificate_issuer = "CN=CA"
    c.valid_from = datetime(2026, 1, 1, tzinfo=timezone.utc)
    c.valid_until = datetime(2027, 1, 1, tzinfo=timezone.utc)
    c.is_active = True
    c.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    c.deleted_at = None
    c.config = {"pfx_encrypted": "enc_data", "password_encrypted": "enc_pass"}
    return c


def _fake_pfx_bytes():
    return b"\x30\x82\x01\x00\x02\x01\x01" * 100


# ── Inspect Credential ────────────────────────────────────────────────────────


@patch("app.api.v1.signing_credentials.hasattr", return_value=True)
@pytest.mark.anyio
async def test_inspect_credential(mock_hasattr, client):
    # The endpoint imports cryptography internally. Patch sys.modules to fake it.
    mock_pkcs12 = MagicMock()
    mock_cert = MagicMock()
    mock_cert.subject.rfc4514_string.return_value = "CN=Test User"
    mock_cert.issuer.rfc4514_string.return_value = "CN=Test CA"
    mock_cert.serial_number = 123456789
    mock_cert.not_valid_before_utc = datetime(2026, 1, 1, tzinfo=timezone.utc)
    mock_cert.not_valid_after_utc = datetime(2027, 1, 1, 23, 59, 59, tzinfo=timezone.utc)
    mock_cert.public_bytes.return_value = b"fake_der"
    mock_cert.extensions = []
    mock_key = MagicMock()
    mock_key.key_size = 2048
    mock_key.__class__.__name__ = "RSAPublicKey"
    mock_pkcs12.load_key_and_certificates.return_value = (mock_key, mock_cert, None)

    mock_hashes = MagicMock()
    mock_hashes.sha256.return_value.hexdigest.return_value = "FINGERPRINT123"

    mock_serialization = MagicMock()
    mock_serialization.Encoding.DER = "DER"
    mock_serialization.pkcs12 = mock_pkcs12

    with patch.dict("sys.modules", {
        "cryptography.hazmat.primitives.serialization": mock_serialization,
        "cryptography.hazmat.primitives.serialization.pkcs12": mock_pkcs12,
        "cryptography.hazmat.primitives.hashes": mock_hashes,
        "cryptography.hazmat.primitives.serialization": mock_serialization,
        "cryptography.x509": MagicMock(),
        "cryptography.x509.CertificatePolicies": MagicMock(),
    }):
        pfx_content = _fake_pfx_bytes()
        files = {"file": ("cert.pfx", pfx_content, "application/x-pkcs12")}
        data = {"password": "test123"}
        response = await client.post("/api/v1/signing-credentials/inspect", data=data, files=files)
        assert response.status_code == 200
        result = response.json()
        assert "subject" in result
        assert "serial_number" in result


@pytest.mark.anyio
async def test_inspect_credential_bad_password(client):
    mock_pkcs12 = MagicMock()
    mock_pkcs12.load_key_and_certificates.side_effect = Exception("Bad password")
    with patch.dict("sys.modules", {
        "cryptography.hazmat.primitives.serialization": mock_pkcs12,
        "cryptography.hazmat.primitives.serialization.pkcs12": mock_pkcs12,
        "cryptography.hazmat.primitives.hashes": MagicMock(),
        "cryptography.x509": MagicMock(),
        "cryptography.x509.CertificatePolicies": MagicMock(),
    }):
        pfx_content = _fake_pfx_bytes()
        files = {"file": ("cert.pfx", pfx_content, "application/x-pkcs12")}
        response = await client.post(
            "/api/v1/signing-credentials/inspect",
            data={"password": "wrong"},
            files=files,
        )
        assert response.status_code == 400


@pytest.mark.anyio
async def test_inspect_credential_empty_file(client):
    files = {"file": ("cert.pfx", b"", "application/x-pkcs12")}
    response = await client.post(
        "/api/v1/signing-credentials/inspect",
        data={"password": "test123"},
        files=files,
    )
    assert response.status_code == 400


# ── List Credentials ──────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_list_credentials(client, override_auth_and_db):
    mock_db, _ = override_auth_and_db
    cred = _make_credential()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [cred]
    mock_db.execute.return_value = mock_result

    response = await client.get("/api/v1/signing-credentials")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["label"] == "My Cert"


@pytest.mark.anyio
async def test_list_credentials_empty(client, override_auth_and_db):
    mock_db, _ = override_auth_and_db
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result

    response = await client.get("/api/v1/signing-credentials")
    assert response.status_code == 200
    assert response.json() == []


# ── Get Credential ────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_get_credential(client, override_auth_and_db):
    mock_db, _ = override_auth_and_db
    cred = _make_credential()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = cred
    mock_db.execute.return_value = mock_result

    response = await client.get(f"/api/v1/signing-credentials/{cred.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(cred.id)


@pytest.mark.anyio
async def test_get_credential_not_found(client, override_auth_and_db):
    mock_db, _ = override_auth_and_db
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    response = await client.get(f"/api/v1/signing-credentials/{uuid.uuid4()}")
    assert response.status_code == 404


# ── Upload Credential ─────────────────────────────────────────────────────────


@patch("app.services.encryption.encrypt_bytes", return_value=b"encrypted_bytes")
@patch("app.services.encryption.encrypt", return_value="encrypted_pass")
@pytest.mark.anyio
async def test_upload_credential(mock_enc, mock_enc_bytes, client, override_auth_and_db):
    mock_db, mock_user = override_auth_and_db

    mock_pkcs12 = MagicMock()
    mock_cert = MagicMock()
    mock_cert.subject.rfc4514_string.return_value = "CN=Test User"
    mock_cert.issuer.rfc4514_string.return_value = "CN=Test CA"
    mock_cert.serial_number = 1234
    mock_cert.not_valid_before_utc = datetime(2026, 1, 1, tzinfo=timezone.utc)
    mock_cert.not_valid_after_utc = datetime(2027, 1, 1, tzinfo=timezone.utc)
    mock_pkcs12.load_key_and_certificates.return_value = (MagicMock(), mock_cert, None)

    mock_serialization = MagicMock()
    mock_serialization.pkcs12 = mock_pkcs12

    pfx_content = _fake_pfx_bytes()
    with patch.dict("sys.modules", {
        "cryptography.hazmat.primitives.serialization": mock_serialization,
        "cryptography.hazmat.primitives.serialization.pkcs12": mock_pkcs12,
        "cryptography.hazmat.primitives.hashes": MagicMock(),
    }):
        files = {"file": ("cert.pfx", pfx_content, "application/x-pkcs12")}
        data = {"label": "My New Cert", "password": "test123"}
        response = await client.post("/api/v1/signing-credentials", data=data, files=files)
        assert response.status_code == 201
        result = response.json()
        assert "id" in result
        assert result["label"] == "My New Cert"


@pytest.mark.anyio
async def test_upload_credential_empty_file(client):
    files = {"file": ("cert.pfx", b"", "application/x-pkcs12")}
    response = await client.post(
        "/api/v1/signing-credentials",
        data={"label": "Bad", "password": "x"},
        files=files,
    )
    assert response.status_code == 400


# ── Sign PDF (avulso) ─────────────────────────────────────────────────────────


@patch("httpx.AsyncClient")
@patch("app.services.encryption.decrypt_bytes", return_value=b"\x30\x82")
@patch("app.services.encryption.decrypt", return_value="decrypted_pass")
@pytest.mark.anyio
async def test_sign_pdf(mock_decrypt, mock_decrypt_bytes, mock_httpx, client, override_auth_and_db):
    mock_db, _ = override_auth_and_db

    cred = _make_credential()
    cred.config = {"pfx_encrypted": "enc_data", "password_encrypted": "enc_pass"}
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = cred
    mock_db.execute.return_value = mock_result

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "signed_pdf_base64": "c2lnbmVk",
        "sha256_signed": "hash123",
        "sha256_original": "hash_orig",
        "certificate_subject": "CN=Test",
        "certificate_serial": "1234",
        "signature_format": "PAdES",
    }
    mock_client_async = AsyncMock()
    mock_client_async.__aenter__.return_value = mock_client_async
    mock_client_async.__aexit__.return_value = None
    mock_client_async.post.return_value = mock_resp
    mock_httpx.return_value = mock_client_async

    pdf_bytes = b"%PDF-1.4 fake pdf content"
    files = {"file": ("doc.pdf", pdf_bytes, "application/pdf")}
    data = {"credential_id": str(cred.id), "visible": "true"}
    response = await client.post("/api/v1/signing-credentials/sign-pdf", data=data, files=files)
    assert response.status_code == 200
    assert response.headers.get("content-type") == "application/pdf"


# ── Delete Credential ─────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_delete_credential(client, override_auth_and_db):
    mock_db, _ = override_auth_and_db
    cred = _make_credential()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = cred
    mock_db.execute.return_value = mock_result

    response = await client.delete(f"/api/v1/signing-credentials/{cred.id}")
    assert response.status_code == 204


@pytest.mark.anyio
async def test_delete_credential_not_found(client, override_auth_and_db):
    mock_db, _ = override_auth_and_db
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    response = await client.delete(f"/api/v1/signing-credentials/{uuid.uuid4()}")
    assert response.status_code == 404


# ── Verify PDF ────────────────────────────────────────────────────────────────


@patch("httpx.AsyncClient")
@pytest.mark.anyio
async def test_verify_pdf_signature(mock_httpx, client):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"valid": True, "signature_count": 1}
    mock_client_async = AsyncMock()
    mock_client_async.__aenter__.return_value = mock_client_async
    mock_client_async.__aexit__.return_value = None
    mock_client_async.post.return_value = mock_resp
    mock_httpx.return_value = mock_client_async

    payload = {"signed_pdf_base64": "c2lnbmVk"}
    response = await client.post("/api/v1/signing-credentials/verify-pdf", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True


@pytest.mark.anyio
async def test_verify_pdf_missing_base64(client):
    response = await client.post("/api/v1/signing-credentials/verify-pdf", json={})
    assert response.status_code == 400
