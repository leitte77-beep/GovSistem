"""Revocation (CRL/OCSP) and A3 provider tests.

All certificates are generated on the fly; no production material is used.
Network access is always mocked so the suite is deterministic.
"""

from datetime import datetime, timedelta, timezone

import httpx
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509 import ocsp as x509_ocsp

from app.core.config import settings
from app.providers import create_provider
from app.providers.icp_brasil import IcpBrasilValidator


def _mock_response(content: bytes = b"", json: dict | None = None) -> httpx.Response:
    """Build a Response with an attached Request so raise_for_status() works."""
    request = httpx.Request("GET", "http://mock")
    if json is not None:
        return httpx.Response(200, json=json, request=request)
    return httpx.Response(200, content=content, request=request)


def _ca():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(x509.oid.NameOID.COMMON_NAME, "CA Teste")])
    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    return key, cert


def _leaf(ca_cert, ca_key, *, with_crl=True, with_ocsp=True):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(timezone.utc)
    name = x509.Name([x509.NameAttribute(x509.oid.NameOID.COMMON_NAME, "Leaf Teste")])
    builder = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(ca_cert.subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=365))
    )
    if with_crl:
        builder = builder.add_extension(
            x509.CRLDistributionPoints(
                [
                    x509.DistributionPoint(
                        full_name=[
                            x509.UniformResourceIdentifier("http://crl.test/ca.crl")
                        ],
                        relative_name=None,
                        reasons=None,
                        crl_issuer=None,
                    )
                ]
            ),
            critical=False,
        )
    if with_ocsp:
        builder = builder.add_extension(
            x509.AuthorityInformationAccess(
                [
                    x509.AccessDescription(
                        x509.oid.AuthorityInformationAccessOID.OCSP,
                        x509.UniformResourceIdentifier("http://ocsp.test"),
                    )
                ]
            ),
            critical=False,
        )
    cert = builder.sign(ca_key, hashes.SHA256())
    return key, cert


def _crl(ca_cert, ca_key, revoked_serial=None):
    now = datetime.now(timezone.utc)
    builder = (
        x509.CertificateRevocationListBuilder()
        .issuer_name(ca_cert.subject)
        .last_update(now - timedelta(hours=1))
        .next_update(now + timedelta(days=1))
    )
    if revoked_serial is not None:
        revoked = (
            x509.RevokedCertificateBuilder()
            .serial_number(revoked_serial)
            .revocation_date(now)
            .add_extension(x509.CRLReason(x509.ReasonFlags.key_compromise), critical=False)
            .build()
        )
        builder = builder.add_revoked_certificate(revoked)
    crl = builder.add_extension(x509.CRLNumber(1), critical=False).sign(
        ca_key, hashes.SHA256()
    )
    return crl.public_bytes(serialization.Encoding.DER)


# ── CRL ──────────────────────────────────────────────────────────────────────


def test_crl_detects_revoked_certificate(monkeypatch):
    ca_key, ca_cert = _ca()
    _, leaf = _leaf(ca_cert, ca_key)
    crl_der = _crl(ca_cert, ca_key, revoked_serial=leaf.serial_number)

    import app.providers.icp_brasil as icp

    monkeypatch.setattr(icp.httpx, "get", lambda *a, **k: _mock_response(content=crl_der))

    validator = IcpBrasilValidator()
    monotonic_ok, checked, detail = validator._check_crl(leaf, [ca_cert])
    assert checked is True
    assert monotonic_ok is False
    assert "revogado" in detail


def test_crl_accepts_non_revoked_certificate(monkeypatch):
    ca_key, ca_cert = _ca()
    _, leaf = _leaf(ca_cert, ca_key)
    crl_der = _crl(ca_cert, ca_key, revoked_serial=None)

    import app.providers.icp_brasil as icp

    monkeypatch.setattr(icp.httpx, "get", lambda *a, **k: _mock_response(content=crl_der))

    validator = IcpBrasilValidator()
    ok, checked, detail = validator._check_crl(leaf, [ca_cert])
    assert checked is True
    assert ok is True
    assert "não consta" in detail


def test_crl_unreachable_is_not_checked(monkeypatch):
    ca_key, ca_cert = _ca()
    _, leaf = _leaf(ca_cert, ca_key)

    def boom(*a, **k):
        raise httpx.ConnectError("offline")

    import app.providers.icp_brasil as icp

    monkeypatch.setattr(icp.httpx, "get", boom)
    validator = IcpBrasilValidator()
    ok, checked, detail = validator._check_crl(leaf, [ca_cert])
    assert ok is True  # not revoked
    assert checked is False  # but explicitly "not checked"
    assert "não foi possível" in detail


# ── OCSP ─────────────────────────────────────────────────────────────────────


class _FakeOCSPResponse:
    def __init__(self, status):
        self.response_status = x509_ocsp.OCSPResponseStatus.SUCCESSFUL
        self.certificate_status = status
        self.revocation_time_utc = datetime.now(timezone.utc)


def test_ocsp_detects_revoked_certificate(monkeypatch):
    ca_key, ca_cert = _ca()
    _, leaf = _leaf(ca_cert, ca_key)

    import app.providers.icp_brasil as icp

    monkeypatch.setattr(
        icp.httpx, "post", lambda *a, **k: _mock_response(content=b"ocsp")
    )
    monkeypatch.setattr(
        icp,
        "load_der_ocsp_response",
        lambda data: _FakeOCSPResponse(x509_ocsp.OCSPCertStatus.REVOKED),
    )

    validator = IcpBrasilValidator()
    ok, checked, detail = validator._check_ocsp(leaf, [ca_cert])
    assert checked is True
    assert ok is False
    assert "revogado" in detail


def test_ocsp_good_certificate(monkeypatch):
    ca_key, ca_cert = _ca()
    _, leaf = _leaf(ca_cert, ca_key)

    import app.providers.icp_brasil as icp

    monkeypatch.setattr(
        icp.httpx, "post", lambda *a, **k: _mock_response(content=b"ocsp")
    )
    monkeypatch.setattr(
        icp,
        "load_der_ocsp_response",
        lambda data: _FakeOCSPResponse(x509_ocsp.OCSPCertStatus.GOOD),
    )

    validator = IcpBrasilValidator()
    ok, checked, detail = validator._check_ocsp(leaf, [ca_cert])
    assert checked is True
    assert ok is True


# ── Mode wiring ──────────────────────────────────────────────────────────────


def test_revocation_off_is_reported_as_not_checked(monkeypatch):
    ca_key, ca_cert = _ca()
    _, leaf = _leaf(ca_cert, ca_key)
    monkeypatch.setattr(settings, "REVOCATION_MODE", "off")
    validator = IcpBrasilValidator()
    ok, checked, _detail, _method = validator._check_revocation(leaf, [ca_cert])
    assert ok is True
    assert checked is False


def test_validate_marks_revoked_certificate_as_invalid(monkeypatch):
    ca_key, ca_cert = _ca()
    _, leaf = _leaf(ca_cert, ca_key)
    crl_der = _crl(ca_cert, ca_key, revoked_serial=leaf.serial_number)

    import app.providers.icp_brasil as icp

    monkeypatch.setattr(icp.httpx, "get", lambda *a, **k: _mock_response(content=crl_der))
    monkeypatch.setattr(settings, "REVOCATION_MODE", "crl")

    validator = IcpBrasilValidator(strict_mode=False)
    result = validator.validate(leaf, [ca_cert])
    assert result.not_revoked is False
    assert result.revocation_checked is True
    assert result.valid is False


# ── A3 providers ─────────────────────────────────────────────────────────────


def test_a3_local_refuses_server_side_signing():
    provider = create_provider("a3_local")
    with pytest.raises(RuntimeError, match="holder's device|middleware"):
        provider.sign(b"%PDF-1.4")


def test_a3_remote_requires_url(monkeypatch):
    monkeypatch.setattr(settings, "SIGNER_A3_REMOTE_URL", "")
    with pytest.raises(ValueError, match="SIGNER_A3_REMOTE_URL"):
        create_provider("a3_remote")


def test_a3_remote_signs_via_bridge(monkeypatch):
    import base64

    import app.providers.a3 as a3

    monkeypatch.setattr(settings, "SIGNER_A3_REMOTE_URL", "http://psc.test")
    signed = b"%PDF-1.4 signed-by-a3"

    def fake_post(url, json=None, headers=None, timeout=None):
        return _mock_response(
            json={
                "signed_pdf_base64": base64.b64encode(signed).decode(),
                "validation_status": "ok",
                "certificate_info": {"subject": "Titular A3"},
                "signed_at": "2026-09-14T00:00:00+00:00",
            }
        )

    monkeypatch.setattr(a3.httpx, "post", fake_post)
    provider = create_provider("a3_remote")
    result = provider.sign(b"%PDF-1.4 unsigned")
    assert result.content == signed
    assert provider.get_certificate_info()["subject"] == "Titular A3"


def test_unknown_provider_still_rejected():
    with pytest.raises(ValueError, match="Unknown signature provider"):
        create_provider("hsm")
