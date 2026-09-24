"""Tests for the real incremental PAdES signing implemented with pyHanko.

Uses a self-signed PKCS#12 test certificate (never an ICP-Brasil production
certificate). Covers Fase 7 criteria: source hash preserved, base revision
preserved, /Sig present, tamper detection, page/mediabox unchanged.
"""
import hashlib
import io

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID
from datetime import datetime, timedelta, timezone
from pypdf import PdfReader, PdfWriter

from app.providers.a1 import PfxA1SignerProvider


@pytest.fixture(scope="module")
def pfx_and_pass():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "TESTE PADES A1:12345678901234")])
    now = datetime.now(timezone.utc)
    cert = (x509.CertificateBuilder()
            .subject_name(name).issuer_name(name)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=1))
            .not_valid_after(now + timedelta(days=365))
            .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
            .sign(key, hashes.SHA256()))
    pfx = pkcs12.serialize_key_and_certificates(
        b"TESTE", key, cert, None, serialization.BestAvailableEncryption(b"testepass"))
    return pfx, b"testepass"


def _make_pdf() -> bytes:
    w = PdfWriter()
    w.add_blank_page(width=595, height=842)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def test_sign_preserves_source_as_base_revision(pfx_and_pass):
    pfx, pw = pfx_and_pass
    src = _make_pdf()
    prov = PfxA1SignerProvider(pfx, pw.decode())
    res = prov.sign(src, visible=False, reason="teste", location="BR", verification_code="ABC")
    assert res.content[: len(src)] == src  # incremental base revision preserved
    assert len(res.content) > len(src)     # only the signature revision appended


def test_sign_produces_real_sig_and_validates(pfx_and_pass):
    pfx, pw = pfx_and_pass
    prov = PfxA1SignerProvider(pfx, pw.decode())
    signed = prov.sign(_make_pdf(), visible=False, reason="teste").content
    det = prov.verify_detailed(signed)
    assert det["valid"] is True
    assert len(det["signatures"]) == 1
    s = det["signatures"][0]
    assert s["intact"] is True
    assert s["subfilter"] in ("/ETSI.CAdES.detached", "ETSI.CAdES.detached")
    assert len(s["byte_range"]) == 4


def test_tamper_detection(pfx_and_pass):
    pfx, pw = pfx_and_pass
    prov = PfxA1SignerProvider(pfx, pw.decode())
    signed = bytearray(prov.sign(_make_pdf(), visible=False, reason="teste").content)
    signed[500] ^= 0xFF  # flip a single byte in the base content
    det = prov.verify_detailed(bytes(signed))
    assert all(not s.get("intact") for s in det["signatures"])


def test_pages_and_mediabox_unchanged(pfx_and_pass):
    pfx, pw = pfx_and_pass
    src = _make_pdf()
    prov = PfxA1SignerProvider(pfx, pw.decode())
    signed = prov.sign(src, visible=False, reason="teste").content
    a = PdfReader(io.BytesIO(src)).pages[0]
    b = PdfReader(io.BytesIO(signed)).pages[0]
    assert len(PdfReader(io.BytesIO(src)).pages) == len(PdfReader(io.BytesIO(signed)).pages)
    assert tuple(float(x) for x in a.mediabox) == tuple(float(x) for x in b.mediabox)


def test_signed_hash_differs_from_source(pfx_and_pass):
    pfx, pw = pfx_and_pass
    src = _make_pdf()
    prov = PfxA1SignerProvider(pfx, pw.decode())
    res = prov.sign(src, visible=False, reason="teste")
    assert hashlib.sha256(res.content).hexdigest() != hashlib.sha256(src).hexdigest()
