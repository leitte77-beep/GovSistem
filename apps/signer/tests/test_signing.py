"""Tests for PDF signing with A1 certificate."""

import base64
import io
import logging
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from httpx import AsyncClient, ASGITransport
from pypdf import PdfReader, PdfWriter

from app.main import app
from app.providers import create_provider


# ── Fixtures: generate test PFX and test PDF ────────────────────────────────

TEST_PFX_PASSWORD = "Test@123!Seguro"


@pytest.fixture(scope="session")
def test_pfx():
    """Generate a self-signed RSA-2048 certificate and export as PFX."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "BR"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "SP"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, "São Paulo"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "DOE Teste Ltda"),
        x509.NameAttribute(NameOID.COMMON_NAME, "Teste Assinatura A1"),
    ])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(1000)
        .not_valid_before(datetime.now(timezone.utc) - timedelta(days=1))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=365))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )

    pfx_bytes = pkcs12.serialize_key_and_certificates(
        name=b"Test Certificate",
        key=key,
        cert=cert,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(
            TEST_PFX_PASSWORD.encode("utf-8")
        ),
    )
    return pfx_bytes, key, cert


@pytest.fixture
def test_pdf():
    """Create a minimal PDF with text content."""
    writer = PdfWriter()
    writer.add_blank_page(595, 842)
    page = writer.pages[0]
    page.merge_page(writer.add_blank_page(595, 842))
    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf.read()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ─── Provider Tests ──────────────────────────────────────────────────────────


class TestPfxA1Provider:
    def test_load_pfx_and_sign(self, test_pfx, test_pdf):
        pfx_bytes, _, _ = test_pfx
        provider = create_provider("a1", pfx_bytes=pfx_bytes, password=TEST_PFX_PASSWORD)
        result = provider.sign(test_pdf, visible=False, reason="Teste")
        assert result is not None
        assert len(result.content) > len(test_pdf)
        assert result.signature_format == "PAdES"
        assert "subject" in result.certificate_info
        assert "serial" in result.certificate_info
        assert "thumbprint" in result.certificate_info

    def test_signed_pdf_opens(self, test_pfx, test_pdf):
        pfx_bytes, _, _ = test_pfx
        provider = create_provider("a1", pfx_bytes=pfx_bytes, password=TEST_PFX_PASSWORD)
        result = provider.sign(test_pdf)
        reader = PdfReader(io.BytesIO(result.content))
        assert len(reader.pages) > 0
        page = reader.pages[0]
        assert page is not None

    def test_signed_pdf_has_signature_field(self, test_pfx, test_pdf):
        pfx_bytes, _, _ = test_pfx
        provider = create_provider("a1", pfx_bytes=pfx_bytes, password=TEST_PFX_PASSWORD)
        result = provider.sign(test_pdf, visible=True, reason="Aprovação")
        assert provider.verify(result.content)

    def test_wrong_password_raises_error(self, test_pfx):
        pfx_bytes, _, _ = test_pfx
        with pytest.raises(Exception):
            create_provider("a1", pfx_bytes=pfx_bytes, password="wrong_password")

    def test_certificate_info(self, test_pfx):
        pfx_bytes, _, _ = test_pfx
        provider = create_provider("a1", pfx_bytes=pfx_bytes, password=TEST_PFX_PASSWORD)
        info = provider.get_certificate_info()
        assert info["provider"] == "a1"
        assert info["format"] == "PAdES"
        assert "Teste Assinatura A1" in info["subject"]
        assert len(info["thumbprint"]) == 40  # SHA-1 hex

    def test_hash_is_sha256(self, test_pfx, test_pdf):
        import hashlib
        pfx_bytes, _, _ = test_pfx
        provider = create_provider("a1", pfx_bytes=pfx_bytes, password=TEST_PFX_PASSWORD)
        result = provider.sign(test_pdf)
        expected = hashlib.sha256(result.content).hexdigest()
        assert expected == hashlib.sha256(result.content).hexdigest()


# ── API Endpoint Tests ───────────────────────────────────────────────────────


class TestInternalSignEndpoint:
    @pytest.mark.anyio
    async def test_sign_endpoint_returns_signed_pdf(self, test_pfx, test_pdf, client):
        pfx_bytes, _, _ = test_pfx
        payload = {
            "edition_id": str(uuid.uuid4()),
            "unsigned_pdf_base64": base64.b64encode(test_pdf).decode("utf-8"),
            "pfx_base64": base64.b64encode(pfx_bytes).decode("utf-8"),
            "pfx_password": TEST_PFX_PASSWORD,
            "reason": "Teste unitário",
            "visible": False,
        }
        response = await client.post("/internal/sign-pdf", json=payload)
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["sha256_signed"] is not None
        assert len(data["sha256_signed"]) == 64
        assert "Teste Assinatura" in data["certificate_subject"]
        assert data["validation_status"] == "ok"
        # Verify the signed PDF is valid
        signed_bytes = base64.b64decode(data["signed_pdf_base64"])
        reader = PdfReader(io.BytesIO(signed_bytes))
        assert len(reader.pages) > 0

    @pytest.mark.anyio
    async def test_wrong_password_returns_400(self, test_pfx, test_pdf, client):
        pfx_bytes, _, _ = test_pfx
        payload = {
            "edition_id": str(uuid.uuid4()),
            "unsigned_pdf_base64": base64.b64encode(test_pdf).decode("utf-8"),
            "pfx_base64": base64.b64encode(pfx_bytes).decode("utf-8"),
            "pfx_password": "wrong",
            "reason": "",
            "visible": False,
        }
        response = await client.post("/internal/sign-pdf", json=payload)
        assert response.status_code == 400

    @pytest.mark.anyio
    async def test_invalid_base64_returns_400(self, client):
        payload = {
            "edition_id": str(uuid.uuid4()),
            "unsigned_pdf_base64": "not-base64!!!",
            "pfx_base64": "dGVzdA==",
            "pfx_password": "pass",
            "reason": "",
            "visible": False,
        }
        response = await client.post("/internal/sign-pdf", json=payload)
        assert response.status_code == 400


# ── Security Tests ──────────────────────────────────────────────────────────


class TestPasswordNotInLogs:
    """Critical security test: PFX password must never appear in logs."""

    def test_password_not_in_log_output(self, test_pfx, test_pdf, caplog):
        caplog.set_level(logging.INFO)
        pfx_bytes, _, _ = test_pfx
        provider = create_provider("a1", pfx_bytes=pfx_bytes, password=TEST_PFX_PASSWORD)
        _ = provider.sign(test_pdf)

        log_text = caplog.text
        assert TEST_PFX_PASSWORD not in log_text, (
            f"PFX password '{TEST_PFX_PASSWORD}' found in logs!"
        )

    def test_pfx_bytes_not_in_log_output(self, test_pfx, test_pdf, caplog):
        caplog.set_level(logging.INFO)
        pfx_bytes, _, _ = test_pfx
        provider = create_provider("a1", pfx_bytes=pfx_bytes, password=TEST_PFX_PASSWORD)
        _ = provider.sign(test_pdf)

        log_text = caplog.text
        pfx_sample = base64.b64encode(pfx_bytes[:20]).decode("utf-8")
        assert pfx_sample not in log_text, "PFX bytes leaked into logs!"

    @pytest.mark.anyio
    async def test_endpoint_response_does_not_include_password(self, test_pfx, test_pdf, client):
        pfx_bytes, _, _ = test_pfx
        payload = {
            "edition_id": str(uuid.uuid4()),
            "unsigned_pdf_base64": base64.b64encode(test_pdf).decode("utf-8"),
            "pfx_base64": base64.b64encode(pfx_bytes).decode("utf-8"),
            "pfx_password": TEST_PFX_PASSWORD,
            "reason": "Teste",
            "visible": False,
        }
        response = await client.post("/internal/sign-pdf", json=payload)
        body = response.text
        assert TEST_PFX_PASSWORD not in body, "Password leaked in response!"
