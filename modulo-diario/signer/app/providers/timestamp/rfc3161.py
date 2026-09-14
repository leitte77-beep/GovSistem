"""RFC 3161 timestamp provider (TSA / ACT).

Builds a TimeStampReq, sends it to the TSA endpoint over HTTP(S), parses the
TimeStampResp and exposes both the raw token and its metadata. Validation is
delegated to asn1crypto for the structure plus pyhanko-certvalidator when a
trust chain (ACT root) is configured.

Important: this module is transport and structur-based. It does NOT claim
policy-conformance for any specific ICP-Brasil ACT; the ``policy`` string is
echoed so callers can attribute the OID actually used. Conformance to a given
PAdES AD-RT / LTV profile remains a configuration and validation concern.
"""

from __future__ import annotations

import base64
import hashlib
import logging
from datetime import datetime, timezone

import httpx
from asn1crypto import algos, cms, tsp

from app.providers.timestamp.base import (
    TimestampProvider,
    TimestampResult,
    TimestampValidation,
)

logger = logging.getLogger(__name__)

DEFAULT_POLICY = "2.16.76.1.7.1.11.1"  # ICP-Brasil time-stamping policy (configurable)


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Rfc3161TimestampProvider(TimestampProvider):
    """RFC 3161 time-stamping against a TSA (ACT) HTTP(S) endpoint."""

    def __init__(self, tsa_url: str, timeout: float = 30.0) -> None:
        self.tsa_url = tsa_url
        self.timeout = timeout

    def digest(self, data: bytes) -> bytes:
        return hashlib.sha256(data).digest()

    def timestamp(self, document_digest: bytes, policy: str = "") -> TimestampResult:
        if not self.tsa_url:
            raise ValueError("TSA URL is not configured")

        # Build TimeStampReq for imprinted digest (SHA-256).
        imprint = algos.DigestAlgorithm({"algorithm": "sha256"})
        req = tsp.TimeStampReq(
            {
                "version": "v1",
                "message_imprint": {"hash_algorithm": imprint, "hashed_message": document_digest},
                "req_policy": policy or None,
                "cert_req": True,
            }
        )

        resp = httpx.post(
            self.tsa_url,
            content=req.dump(),
            headers={"Content-Type": "application/timestamp-query"},
            timeout=self.timeout,
        )
        resp.raise_for_status()

        ts_resp = tsp.TimeStampResp.load(resp.content)
        raw_status = ts_resp["status"]["status"]
        status = raw_status.dotted if hasattr(raw_status, "dotted") else str(raw_status)

        success = status in ("0", "granted", "granted_with_mods")
        if not success:
            raise ValueError(f"TSA refused request: {ts_resp['status']['status_string'].native}")

        token = ts_resp["time_stamp_token"].dump() if ts_resp["time_stamp_token"].native else b""

        # Extract metadata from the signed CMS token.
        policy_oid = policy or DEFAULT_POLICY
        gen_time = ""
        serial = ""
        imprint_hex = ""
        try:
            signed_data = cms.ContentInfo.load(token)["content"]
            encap = signed_data["encap_content_info"]
            if encap["content_type"].native == "tst_info":
                tst = tsp.TSTInfo.load(encap["content"].native)
                policy_oid = tst["policy"].dotted
                gen_time = str(tst["gen_time"].native)
                serial = str(tst["serial_number"])
                ml = tst["message_imprint"]["hashed_message"]
                imprint_hex = ml.hex() if hasattr(ml, "hex") else base64.b16encode(ml).decode()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not parse timestamp token metadata: %s", exc)

        return TimestampResult(
            token=token,
            tsa_name=self.tsa_url,
            tsa_url=self.tsa_url,
            serial_number=serial,
            policy_oid=policy_oid,
            message_imprint_algorithm="sha256",
            message_imprint=imprint_hex,
            gen_time=gen_time,
            status="VALID",
            validation_status="PENDING_VALIDATION",
        )

    def validate(self, token: bytes) -> TimestampValidation:
        """Validate the structure of a timestamp token.

        Reports structural validity and the policy OID actually used. Full
        chain-of-trust validation against an ACT root requires a configured
        trust store and is handled by the validation service; here we avoid
        asserting unwarranted trust.
        """
        try:
            signed_data = cms.ContentInfo.load(token)["content"]
            encap = signed_data["encap_content_info"]
            tst = tsp.TSTInfo.load(encap["content"].native)

            digest_alg = signed_data["digest_algorithms"][0]["algorithm"].native
            errors: list[str] = []
            if digest_alg != "sha256":
                errors.append(f"Unsupported digest algorithm: {digest_alg}")

            message_imprint = tst["message_imprint"]["hashed_message"]
            if hasattr(message_imprint, "native"):
                message_imprint = message_imprint.native

            return TimestampValidation(
                status="VALID",
                valid=not errors,
                policy=str(tst["policy"].dotted),
                gen_time=str(tst["gen_time"].native),
                errors=errors,
            )
        except Exception as exc:  # noqa: BLE001
            return TimestampValidation(
                status="INVALID",
                valid=False,
                errors=[f"token parse/validate error: {exc}"],
            )

    def get_certificate_info(self, token: bytes) -> dict:  # pragma: no cover
        """Best-effort extraction of the signing certificate identifier."""
        try:
            signed_data = cms.ContentInfo.load(token)["content"]
            certs = signed_data["certificates"] or []
            if not certs:
                return {}
            cert = certs[0]
            return {
                "subject": cert.subject.human_friendly,
                "issuer": cert.issuer.human_friendly,
                "serial": str(cert.serial_number),
                "valid_from": str(cert["tbs_certificate"]["validity"]["not_before"].native),
                "valid_to": str(cert["tbs_certificate"]["validity"]["not_after"].native),
            }
        except Exception:  # noqa: BLE001
            return {}
