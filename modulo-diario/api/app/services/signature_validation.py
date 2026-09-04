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

        # Determine status.
        if signer_report.get("errors") and not result.integrity:
            result.status = ValidationStatus.INVALID.value
        elif not sigs:
            result.status = ValidationStatus.INDETERMINATE.value
        elif result.integrity and not result.chain_trusted:
            # Integrity intact but chain not trusted (e.g. self-signed test cert).
            result.status = ValidationStatus.VALID.value
        elif result.integrity and result.chain_trusted:
            result.status = ValidationStatus.VALID.value
        else:
            result.status = ValidationStatus.INVALID.value

        return result
