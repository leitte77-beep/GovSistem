"""Signer provider tests."""

import base64
import hashlib
import io

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from httpx import ASGITransport, AsyncClient

from app.main import app


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
        .not_valid_before(x509.datetime(2024, 1, 1))
        .not_valid_after(x509.datetime(2030, 12, 31))
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
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
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
        "/internal/inspect",
        json={"pfx_base64": pfx_b64, "pfx_password": "test123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "subject" in data
    assert "serial_number" in data
    assert "sha256_fingerprint" in data


def test_create_unknown_provider():
    from app.providers import create_provider
    with pytest.raises(ValueError, match="Unknown signature provider"):
        create_provider("hsm")


def test_valid_provider():
    from app.providers import create_provider, PfxA1SignerProvider
    provider = create_provider("a1")
    assert isinstance(provider, PfxA1SignerProvider)


@pytest.mark.anyio
async def test_verify_endpoint(client, test_pfx):
    pfx_b64 = base64.b64encode(test_pfx).decode()
    # Sign a minimal PDF first
    sign_response = await client.post(
        "/internal/sign-pdf",
        json={
            "edition_id": "test-edition",
            "unsigned_pdf_base64": base64.b64encode(b"%PDF-1.4 test").decode(),
            "pfx_base64": pfx_b64,
            "pfx_password": "test123",
            "reason": "Test signing",
        },
    )
    assert sign_response.status_code == 200
    signed_b64 = sign_response.json().get("signed_pdf_base64", "")

    # Verify the signed PDF
    verify_response = await client.post(
        "/internal/verify-pdf",
        json={"signed_pdf_base64": signed_b64},
    )
    assert verify_response.status_code == 200
    data = verify_response.json()
    assert data["valid"] is True


@pytest.mark.anyio
async def test_sign_endpoint_missing_fields(client):
    response = await client.post("/internal/sign-pdf", json={})
    assert response.status_code == 422
