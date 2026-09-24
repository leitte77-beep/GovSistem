"""Honesty guarantees for signature validation.

An intact CMS is not a trusted signature. Without a validated ICP-Brasil
chain the result must never be reported as "valid".
"""

from app.services.signature_validation import (
    SignatureValidationService,
    certificate_valid_at,
    pades_profile_from_report,
)


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


def test_certificate_valid_at_window():
    assert certificate_valid_at(
        "2025-01-01T00:00:00+00:00", "2027-01-01T00:00:00+00:00", "2026-06-01T00:00:00+00:00"
    ) is True
    assert certificate_valid_at(
        "2025-01-01T00:00:00+00:00", "2026-01-01T00:00:00+00:00", "2026-06-01T00:00:00+00:00"
    ) is False
    # Unknown end date must be "not verified", never a positive claim.
    assert certificate_valid_at("2025-01-01T00:00:00+00:00", None, None) is None


def test_pades_profile_only_claims_ad_rb_with_policy_oid():
    assert pades_profile_from_report({}) == "PAdES-B-B"
    assert pades_profile_from_report({"policy_oid": ""}) == "PAdES-B-B"
    assert "AD-RB" in pades_profile_from_report({"policy_oid": "2.16.76.1.7.1.11.1.3"})
    assert pades_profile_from_report(
        {"policy_oid": "2.16.76.1.7.1.11.1.3", "timestamp_status": "present"}
    ).endswith("+ RFC3161")
