"""Tests for the Mock signature provider and fail-closed provider factory."""

from __future__ import annotations

import io

import pytest

from app.core.config import Settings
from app.providers.base import SignatureProvider
from app.providers.mock import HOMOLOGATION_WATERMARK, MockSignatureProvider


def _make_pdf() -> bytes:
    from pypdf import PdfWriter

    w = PdfWriter()
    w.add_blank_page(width=595, height=842)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def test_mock_provider_is_a_signature_provider():
    assert issubclass(MockSignatureProvider, SignatureProvider)


def test_mock_sign_marks_as_homologation():
    prov = MockSignatureProvider()
    src = _make_pdf()
    res = prov.sign(src)
    assert b"signature_provider=mock" in res.content
    assert res.certificate_info.get("signature_provider") == "mock"
    assert res.certificate_info.get("format") == "MOCK"
    assert "SEM VALIDADE JURIDICA" in HOMOLOGATION_WATERMARK.replace("Í", "I")
    assert prov.verify(res.content) is False


def test_mock_never_claims_icp_brasil():
    prov = MockSignatureProvider()
    res = prov.sign(_make_pdf())
    assert res.certificate_info.get("subject", "").startswith("HOMOLOGACAO")
    assert "SEM VALIDADE JURIDICA" in HOMOLOGATION_WATERMARK.replace("Í", "I")
    assert "NAO ASSINADO COM ICP-BRASIL" in HOMOLOGATION_WATERMARK.replace("Ã", "A")


def test_factory_rejects_mock_in_production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    from app.providers import create_provider, is_production

    assert is_production() is True
    with pytest.raises(ValueError):
        create_provider("mock")


def test_factory_allows_mock_in_development(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")
    from app.providers import create_provider, is_production

    assert is_production() is False
    prov = create_provider("mock")
    assert isinstance(prov, MockSignatureProvider)


def test_production_config_rejects_mock():
    with pytest.raises(ValueError):
        Settings(
            ENVIRONMENT="production",
            INTERNAL_API_KEY="k" * 48,
            SIGNER_PROVIDER="mock",
        )


def test_production_config_rejects_short_internal_key():
    with pytest.raises(ValueError):
        Settings(ENVIRONMENT="production", INTERNAL_API_KEY="short")


def test_production_config_rejects_known_default_key():
    with pytest.raises(ValueError):
        Settings(ENVIRONMENT="production", INTERNAL_API_KEY="change-me-in-dev")


def test_dev_config_allows_mock():
    s = Settings(ENVIRONMENT="development", SIGNER_PROVIDER="mock")
    assert s.SIGNER_PROVIDER == "mock"
