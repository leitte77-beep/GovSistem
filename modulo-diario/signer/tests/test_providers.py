"""Signer provider tests."""

import base64
import io
from datetime import datetime, timezone

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from httpx import ASGITransport, AsyncClient
from pypdf import PdfWriter

from app.main import app

INTERNAL_KEY = "dev-internal-key-saas"
AUTH_HEADERS = {"X-Internal-Key": INTERNAL_KEY}


@pytest.fixture(scope="session")
def test_key_cert():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(x509.oid.NameOID.COMMON_NAME, "Test Signer"),
    ])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime(2024, 1, 1, tzinfo=timezone.utc))
        .not_valid_after(datetime(2030, 12, 31, tzinfo=timezone.utc))
        .sign(key, hashes.SHA256())
    )
    return key, cert


@pytest.fixture(scope="session")
def test_pfx(test_key_cert):
    key, cert = test_key_cert
    pfx_bytes = pkcs12.serialize_key_and_certificates(
        name=b"test",
        key=key,
        cert=cert,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(b"test123"),
    )
    return pfx_bytes


@pytest.fixture
def minimal_pdf() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(595, 842)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers=AUTH_HEADERS,
    ) as ac:
        yield ac


@pytest.mark.anyio
async def test_health_check(client):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.anyio
async def test_inspect_certificate(client, test_pfx):
    pfx_b64 = base64.b64encode(test_pfx).decode()
    response = await client.post(
        "/internal/certificates/inspect",
        data={"pfx_base64": pfx_b64, "password": "test123"},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert "subject" in data
    assert "serial_number" in data
    assert "sha256_fingerprint" in data


def test_create_unknown_provider():
    from app.providers import create_provider
    with pytest.raises(ValueError, match="Unknown signature provider"):
        create_provider("hsm")


def test_valid_provider(test_pfx):
    from app.providers import PfxA1SignerProvider, create_provider
    provider = create_provider("a1", pfx_bytes=test_pfx, password="test123")
    assert isinstance(provider, PfxA1SignerProvider)


@pytest.mark.anyio
async def test_verify_endpoint(client, test_pfx, minimal_pdf):
    pfx_b64 = base64.b64encode(test_pfx).decode()
    sign_response = await client.post(
        "/internal/sign-pdf",
        json={
            "edition_id": "test-edition",
            "unsigned_pdf_base64": base64.b64encode(minimal_pdf).decode(),
            "pfx_base64": pfx_b64,
            "pfx_password": "test123",
            "reason": "Test signing",
        },
    )
    assert sign_response.status_code == 200, sign_response.text
    signed_b64 = sign_response.json().get("signed_pdf_base64", "")
    assert signed_b64

    verify_response = await client.post(
        "/internal/verify-pdf",
        json={"signed_pdf_base64": signed_b64},
    )
    assert verify_response.status_code == 200
    data = verify_response.json()
    signatures = data.get("signatures") or []
    assert signatures, "the signed PDF must expose its signature"
    # The CMS digest over /ByteRange must be intact and the profile must be
    # PAdES. The certificate is self-signed, so the chain is NOT trusted and
    # the document is correctly reported as not fully "valid" — we must never
    # claim a trusted signature without an ICP-Brasil trust store.
    assert signatures[0]["intact"] is True
    assert signatures[0]["subfilter"] == "/ETSI.CAdES.detached"
    assert signatures[0]["byte_range"]
    # Integrity is valid, but the self-signed certificate has no ICP-Brasil
    # chain, so it must not be reported as trusted.
    assert signatures[0]["trusted"] is False


@pytest.mark.anyio
async def test_sign_endpoint_missing_fields(client):
    response = await client.post("/internal/sign-pdf", json={})
    assert response.status_code == 422
