"""Centralized signature validation service.

Keeps cryptographic validation out of controllers. Produces the structured
result required by the hardening spec so the API (and UI) can reason about
``integrity``, ``signature_valid``, ``certificate_valid``, ``chain_trusted``,
``revocation_status`` and ``timestamp_status`` independently.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

from app.models.enums import ValidationStatus

# Only these values prove that a revocation source was actually consulted.
# Anything else ("not_checked", "pending_validation", ...) must never be
# surfaced as "revocation verified".
REVOCATION_CHECKED_VALUES = {"valid", "revoked", "good", "checked", "ok"}

# Only these values prove the presence of a real RFC 3161 token. The ordinary
# signing date (``signed_at``) is NOT a timestamp.
TIMESTAMP_PRESENT_VALUES = {"valid", "present", "granted", "ok"}


def _parse_dt(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def certificate_valid_at(valid_from, valid_to, at=None) -> bool | None:
    """Whether the certificate was within its validity window at ``at``.

    Returns ``None`` (não verificado) when the validity end is unknown, so the
    UI can distinguish "unknown" from a genuine "not valid".
    """
    end = _parse_dt(valid_to)
    if end is None:
        return None
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    moment = _parse_dt(at) or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    start = _parse_dt(valid_from)
    if start is not None and start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if start is not None and moment < start:
        return False
    return moment <= end


def pades_profile_from_report(report: dict | None) -> str:
    """Honest PAdES profile label.

    The ICP-Brasil AD-RB policy is only claimed when the signer actually
    reported a policy OID; otherwise a plain PAdES-B-B (or lower) is reported.
    """
    report = report or {}
    policy_oid = str(report.get("policy_oid") or "").strip()
    timestamp_status = str(report.get("timestamp_status") or "").strip().lower()
    profile = "PAdES-B-B / ICP-Brasil AD-RB" if policy_oid else "PAdES-B-B"
    if timestamp_status in TIMESTAMP_PRESENT_VALUES:
        profile += " + RFC3161"
    return profile


@dataclass
class SignatureValidationResult:
    """Structured validation outcome for a signed PDF."""

    status: str = "pending_validation"
    integrity: bool = False
    signature_valid: bool = False
    certificate_valid: bool = False
    chain_trusted: bool = False
    revocation_status: str = "not_checked"
    timestamp_status: str = "pending_validation"
    policy: str = ""
    number_of_signatures: int = 0
    validated_at: str = ""
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


class SignatureValidationService:
    """Normalizes a signer verify report into a structured validation result."""

    def normalize(
        self,
        signer_report: dict,
        signed_pdf_hash: str | None = None,
        actual_signed_hash: str | None = None,
        certificate_valid: bool | None = None,
        chain_trusted: bool | None = None,
        revocation_status: str | None = None,
        timestamp_status: str | None = None,
    ) -> SignatureValidationResult:
        result = SignatureValidationResult()
        result.validated_at = datetime.now(timezone.utc).isoformat()

        sigs = signer_report.get("signatures", [])
        result.number_of_signatures = len(sigs)

        result.integrity = bool(sigs and all(s.get("intact") for s in sigs))
        result.signature_valid = bool(signer_report.get("valid") and result.integrity)
        result.errors = list(signer_report.get("errors", [])) + list(
            signer_report.get("warnings", [])
        )

        # Hash cross-check against the stored signed_pdf_hash.
        if signed_pdf_hash and actual_signed_hash and signed_pdf_hash != actual_signed_hash:
            result.errors.append("Signed PDF hash mismatch with stored hash")
            result.integrity = False

        if chain_trusted is not None:
            result.chain_trusted = chain_trusted
        if certificate_valid is not None:
            result.certificate_valid = certificate_valid
        if revocation_status is not None:
            result.revocation_status = revocation_status
        if timestamp_status is not None:
            result.timestamp_status = timestamp_status

        # Determine status. A cryptographically intact signature is NOT the
        # same as a trusted one: when the ICP-Brasil chain could not be
        # validated (missing roots, unreachable LCR/OCSP) the outcome is
        # "indeterminate", never "valid".
        if signer_report.get("errors") and not result.integrity:
            result.status = ValidationStatus.INVALID.value
        elif not sigs:
            result.status = ValidationStatus.INDETERMINATE.value
        elif not result.integrity:
            result.status = ValidationStatus.INVALID.value
        elif result.certificate_valid is False:
            result.status = ValidationStatus.INVALID.value
        elif result.chain_trusted:
            result.status = ValidationStatus.VALID.value
        else:
            # Integrity intact but the chain was not validated: not "valid",
            # and deliberately not pushed into ``errors`` (it is not an
            # integrity failure). Callers surface this as a warning/issue.
            result.status = ValidationStatus.INDETERMINATE.value

        return result
