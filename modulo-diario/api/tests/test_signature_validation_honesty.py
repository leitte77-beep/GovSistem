"""Honesty guarantees for signature validation.

An intact CMS is not a trusted signature. Without a validated ICP-Brasil
chain the result must never be reported as "valid".
"""

from app.services.signature_validation import SignatureValidationService


def _report(valid=True, intact=True, errors=None):
    return {
        "valid": valid,
        "signatures": [{"intact": intact}],
        "errors": errors or [],
        "warnings": [],
    }


def test_intact_but_untrusted_chain_is_indeterminate():
    svc = SignatureValidationService()
    result = svc.normalize(
        _report(),
        chain_trusted=False,
        certificate_valid=True,
    )
    assert result.integrity is True
    assert result.status == "indeterminate"


def test_intact_and_trusted_chain_is_valid():
    svc = SignatureValidationService()
    result = svc.normalize(
        _report(),
        chain_trusted=True,
        certificate_valid=True,
    )
    assert result.status == "valid"


def test_expired_certificate_is_invalid_even_if_trusted():
    svc = SignatureValidationService()
    result = svc.normalize(
        _report(),
        chain_trusted=True,
        certificate_valid=False,
    )
    assert result.status == "invalid"


def test_tampered_signature_is_invalid():
    svc = SignatureValidationService()
    result = svc.normalize(
        _report(valid=False, intact=False),
        chain_trusted=True,
    )
    assert result.status == "invalid"


def test_hash_mismatch_is_invalid():
    svc = SignatureValidationService()
    result = svc.normalize(
        _report(),
        signed_pdf_hash="a" * 64,
        actual_signed_hash="b" * 64,
        chain_trusted=True,
        certificate_valid=True,
    )
    assert result.integrity is False
    assert result.status == "invalid"
