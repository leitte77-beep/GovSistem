"""Honesty guarantees for the public authenticity payload.

The public page must never assert a positive state (intact, trusted, revocation
checked, timestamped) without evidence for that specific claim. Regression
guards for the false/contradictory signature states reported in production.
"""

from datetime import datetime, timezone
from unittest.mock import MagicMock

from app.api.public_v1.semantic import _build_authenticity

_UTC = timezone.utc


def _sig(
    *,
    chain_trusted: bool = True,
    valid_from: str = "2025-01-01T00:00:00+00:00",
    valid_to: str = "2027-01-01T00:00:00+00:00",
    signed_at: datetime | None = datetime(2026, 6, 1, tzinfo=_UTC),
    validation_status: str = "ok",
    timestamp_records: list | None = None,
):
    s = MagicMock()
    s.signed_at = signed_at
    s.timestamp_records = timestamp_records if timestamp_records is not None else []
    s.certificate_info = {
        "subject": "CN=Municipio de Farol",
        "serial": "ABCDEF1234",
        "issuer": "CN=AC",
        "valid_from": valid_from,
        "valid_to": valid_to,
        "signature_format": "PAdES",
        "validation_status": validation_status,
        "chain_trusted": chain_trusted,
    }
    return s


def _edition(status="valid", details=None, signatures=None, signed_pdf_path="signed.pdf"):
    e = MagicMock()
    e.signature_validation_status = status
    e.signature_validation_details = details if details is not None else {}
    e.signatures = signatures if signatures is not None else []
    e.signed_pdf_path = signed_pdf_path
    e.signed_pdf_hash = "a" * 64
    e.pdf_hash = "a" * 64
    e.content_manifest_hash = "b" * 64
    e.verification_code = "20260033-ABCD1234"
    return e


def test_invalid_status_is_never_intact_or_trusted():
    # No structured details: a non-empty status column ("invalid") must not be
    # coerced into True as the old `bool(status)` did.
    auth = _build_authenticity(_edition(status="invalid", details={}, signatures=[_sig()]), None)
    assert auth["states"]["intact"] is False
    assert auth["states"]["trusted"] is False


def test_missing_status_is_not_intact():
    auth = _build_authenticity(_edition(status=None, details={}, signatures=[]), None)
    states = auth["states"]
    assert states["intact"] is False
    assert states["trusted"] is False
    assert states["chain_trusted"] is None
    assert states["certificate_valid"] is None
    assert states["revocation_checked"] is None
    assert states["timestamped"] is None


def test_fresh_details_override_stale_signer_chain_metadata():
    # The signer metadata says chain_trusted=True, but the authoritative last
    # validation run says False. The fresh result must win (no OR-ing).
    details = {
        "integrity": True,
        "chain_trusted": False,
        "revocation_status": "not_checked",
        "timestamp_status": "not_present",
    }
    auth = _build_authenticity(
        _edition(status="indeterminate", details=details, signatures=[_sig(chain_trusted=True)]),
        None,
    )
    states = auth["states"]
    assert states["intact"] is True
    assert states["chain_trusted"] is False
    assert states["trusted"] is False


def test_signer_validation_status_does_not_imply_revocation_checked():
    details = {
        "integrity": True,
        "chain_trusted": True,
        "revocation_status": "not_checked",
        "timestamp_status": "not_present",
    }
    auth = _build_authenticity(
        _edition(status="valid", details=details, signatures=[_sig(validation_status="ok")]),
        None,
    )
    # "ok" is the signer's own verification status, not an OCSP/CRL check.
    assert auth["states"]["revocation_checked"] is False
    assert auth["revocation_status"] == "not_checked"


def test_revocation_checked_only_for_real_check_values():
    details = {
        "integrity": True,
        "chain_trusted": True,
        "revocation_status": "valid",
        "timestamp_status": "not_present",
    }
    auth = _build_authenticity(
        _edition(status="valid", details=details, signatures=[_sig()]), None
    )
    assert auth["states"]["revocation_checked"] is True


def test_signed_at_is_not_a_timestamp():
    details = {
        "integrity": True,
        "chain_trusted": True,
        "revocation_status": "not_checked",
        "timestamp_status": "not_present",
    }
    signed = _sig(signed_at=datetime(2026, 6, 1, tzinfo=_UTC))
    auth = _build_authenticity(
        _edition(status="valid", details=details, signatures=[signed]), None
    )
    assert auth["states"]["timestamped"] is False
    assert auth["signatures"][0]["timestamp"] is None


def test_real_timestamp_record_sets_timestamped():
    record = MagicMock()
    record.validation_status = "valid"
    record.status = "valid"
    record.gen_time = datetime(2026, 6, 1, 12, 0, tzinfo=_UTC)
    signed = _sig(timestamp_records=[record])
    details = {
        "integrity": True,
        "chain_trusted": True,
        "revocation_status": "not_checked",
        "timestamp_status": "not_present",
    }
    auth = _build_authenticity(
        _edition(status="valid", details=details, signatures=[signed]), None
    )
    assert auth["states"]["timestamped"] is True
    assert auth["signatures"][0]["timestamp"] == record.gen_time.isoformat()


def test_present_token_record_also_surfaces_gen_time():
    """An embedded (present) token exposes the TSA gen_time; chain stays pending."""
    record = MagicMock()
    record.validation_status = "pending_validation"
    record.status = "present"
    record.gen_time = datetime(2026, 6, 1, 12, 0, tzinfo=_UTC)
    signed = _sig(timestamp_records=[record])
    details = {
        "integrity": True,
        "chain_trusted": True,
        "revocation_status": "not_checked",
        "timestamp_status": "present",
    }
    auth = _build_authenticity(
        _edition(status="valid", details=details, signatures=[signed]), None
    )
    assert auth["states"]["timestamped"] is True
    assert auth["signatures"][0]["timestamp"] == record.gen_time.isoformat()


def test_trusted_requires_full_evidence():
    validated_at = "2026-06-02T10:00:00+00:00"
    details = {
        "integrity": True,
        "chain_trusted": True,
        "certificate_valid": True,
        "revocation_status": "valid",
        "timestamp_status": "present",
        "validated_at": validated_at,
    }
    auth = _build_authenticity(
        _edition(status="valid", details=details, signatures=[_sig()]), None
    )
    states = auth["states"]
    assert states["trusted"] is True
    assert states["intact"] is True
    assert states["timestamped"] is True
    assert auth["validation_checked_at"] == validated_at


def test_certificate_valid_falls_back_to_temporal_window():
    details = {
        "integrity": True,
        "chain_trusted": True,
        "revocation_status": "not_checked",
        "timestamp_status": "not_present",
    }
    auth = _build_authenticity(
        _edition(status="valid", details=details, signatures=[_sig()]), None
    )
    assert auth["states"]["certificate_valid"] is True
