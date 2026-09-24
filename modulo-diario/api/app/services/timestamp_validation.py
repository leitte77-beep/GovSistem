"""Independent RFC 3161 time-stamp token validation.

Kept separate from the A1 signer (``app.providers.a1``): embedding a token in
the CMS is *not* the same as validating it. This service parses the CMS
``TimeStampToken`` and reports each property independently -- CMS signature,
message imprint, TSA certificate validity/EKU, chain of trust, revocation,
policy OID and ``genTime`` -- so a token is only ever reported as ``valid``
when there is real evidence for it.

Trust model
-----------
``TSA_TRUST_ROOTS_PATH`` holds the *trust anchors* (e.g. the ICP-Brasil root
certificates the municipality decided to trust). ``TSA_INTERMEDIATES_PATH``
holds auxiliary CA certificates used only to build the path. A certificate
found in the intermediates bundle is **never** promoted to a trust anchor.

All cryptographic verdicts are made at ``genTime`` (the moment the TSA
asserted), never at "now": a certificate that expired since then was still
valid when the token was issued.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import pathlib
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone

from asn1crypto import cms, tsp
from asn1crypto import crl as asn1_crl
from asn1crypto import x509 as asn1_x509
from cryptography import x509
from cryptography.hazmat.primitives import serialization
from cryptography.x509.oid import ExtendedKeyUsageOID

from app.models.enums import ValidationStatus

logger = logging.getLogger(__name__)

# id-kp-timeStamping (RFC 3161, §2.3): the TSA certificate must carry this EKU.
TIME_STAMPING_EKU = ExtendedKeyUsageOID.TIME_STAMPING
CLOCK_SKEW = timedelta(minutes=5)
EARLIEST_GEN_TIME = datetime(2000, 1, 1, tzinfo=timezone.utc)

TOKEN_ABSENT = "absent"
TOKEN_PRESENT = "present"

VALID_REVOCATION_MODES = {"soft-fail", "hard-fail", "require"}
# Sub-indications that mean "the chain itself is fine, but revocation evidence
# could not be established" -- those must be indeterminate, not invalid.
_REVOCATION_PROBLEM_HINTS = ("REVOKED", "REVINFO", "TRY_LATER", "POE", "STALE")


# ── trust store ──────────────────────────────────────────────────────────────


@dataclass
class TrustStore:
    """A versioned set of trust anchors plus auxiliary intermediate CAs.

    ``roots`` are the only certificates used as trust anchors. Intermediates
    exist to help build the path and are exposed separately on purpose.
    """

    name: str = "ICP-Brasil"
    version: str = ""
    roots: list = field(default_factory=list)
    intermediates: list = field(default_factory=list)
    bundle_sha256: str = ""
    root_fingerprints: list[str] = field(default_factory=list)
    roots_path: str = ""
    intermediates_path: str = ""
    loaded_at: str = ""

    @property
    def root_count(self) -> int:
        return len(self.roots)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "version": self.version,
            "bundle_sha256": self.bundle_sha256,
            "root_count": len(self.roots),
            "intermediate_count": len(self.intermediates),
            "root_fingerprints": list(self.root_fingerprints),
            "roots_path": self.roots_path,
            "intermediates_path": self.intermediates_path,
            "loaded_at": self.loaded_at,
        }


@dataclass
class TimestampValidationResult:
    """Structured outcome of validating one RFC 3161 token.

    ``status`` describes the *token lifecycle* (``absent``/``present``) while
    ``validation_status`` describes the *cryptographic verdict*
    (``valid``/``invalid``/``indeterminate``/``pending_validation``). Keeping
    them apart is what lets the portal show "presente / cadeia pendente"
    without ever claiming "válido".
    """

    status: str = TOKEN_ABSENT
    validation_status: str = ValidationStatus.PENDING_VALIDATION.value
    token_present: bool = False
    token_parseable: bool = False
    cms_signature_valid: bool | None = None
    cms_integrity: bool | None = None
    message_imprint_valid: bool | None = None
    message_imprint_algorithm: str | None = None
    message_imprint: str | None = None
    tsa_certificate: dict | None = None
    certificate_valid_at_gen_time: bool | None = None
    extended_key_usage_valid: bool | None = None
    chain_trusted: bool | None = None
    chain: dict = field(default_factory=dict)
    revocation: dict = field(default_factory=dict)
    trust_store: dict = field(default_factory=dict)
    policy_oid: str | None = None
    policy_check: str = "not_enforced"
    policy_valid: bool | None = None
    gen_time: str | None = None
    gen_time_sane: bool | None = None
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    validated_at: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def is_valid(self) -> bool:
        return self.validation_status == ValidationStatus.VALID.value


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _digest(algorithm: str, data: bytes) -> bytes | None:
    name = str(algorithm or "").strip().lower().replace("-", "")
    try:
        return hashlib.new(name, data).digest()
    except ValueError:
        return None


def _coerce_token_bytes(token: bytes | bytearray | str | None) -> bytes | None:
    """Accept raw DER, base64-DER (how we persist it) or latin-1 text."""
    if token is None:
        return None
    if isinstance(token, (bytes, bytearray)):
        return bytes(token) or None
    if not isinstance(token, str):
        return None
    raw = token.strip()
    if not raw:
        return None
    try:
        decoded = base64.b64decode(raw, validate=True)
        if decoded[:1] == b"\x30":  # DER SEQUENCE
            return decoded
    except (ValueError, TypeError):
        pass
    try:
        return raw.encode("latin-1")
    except (UnicodeEncodeError, TypeError):
        return None


# ── certificate / CRL loading ────────────────────────────────────────────────


def _load_certs_from_bytes(data: bytes) -> list[asn1_x509.Certificate]:
    certs: list[x509.Certificate] = []
    try:
        certs = list(x509.load_pem_x509_certificates(data))
    except ValueError:
        certs = []
    if not certs:
        try:
            certs = [x509.load_der_x509_certificate(data)]
        except ValueError:
            certs = []
    return [
        asn1_x509.Certificate.load(c.public_bytes(serialization.Encoding.DER))
        for c in certs
    ]


def load_certificates(path: str | None) -> list[asn1_x509.Certificate]:
    """Load every X.509 certificate in a PEM/DER file or a directory of them."""
    if not path:
        return []
    target = pathlib.Path(path)
    if not target.exists():
        logger.warning("certificate path does not exist: %s", path)
        return []
    files = (
        sorted(p for p in target.iterdir() if p.is_file())
        if target.is_dir()
        else [target]
    )
    certs: list[asn1_x509.Certificate] = []
    for file_path in files:
        try:
            certs.extend(_load_certs_from_bytes(file_path.read_bytes()))
        except Exception:  # noqa: BLE001 - a broken file must not kill the store
            logger.warning("Could not load certificate %s", file_path, exc_info=True)
    return certs


def load_trust_roots(path: str | None) -> list[asn1_x509.Certificate]:
    """Backwards-compatible alias for ``load_certificates``."""
    return load_certificates(path)


def load_crls(path: str | None) -> list[asn1_crl.CertificateList]:
    """Load every CRL found in a DER/PEM file or a directory of them."""
    if not path:
        return []
    target = pathlib.Path(path)
    if not target.exists():
        logger.warning("CRL path does not exist: %s", path)
        return []
    files = (
        sorted(p for p in target.iterdir() if p.is_file())
        if target.is_dir()
        else [target]
    )
    crls: list[asn1_crl.CertificateList] = []
    for file_path in files:
        data = file_path.read_bytes()
        try:
            crls.append(asn1_crl.CertificateList.load(data))
        except Exception:  # noqa: BLE001
            try:
                crl_obj = x509.load_pem_x509_crl(data)
                crls.append(
                    asn1_crl.CertificateList.load(
                        crl_obj.public_bytes(serialization.Encoding.DER)
                    )
                )
            except Exception:  # noqa: BLE001
                logger.warning("Could not load CRL %s", file_path, exc_info=True)
    return crls


def _manifest(path: str | None) -> dict:
    if not path:
        return {}
    manifest_path = pathlib.Path(path) / "manifest.json"
    if not manifest_path.is_file():
        return {}
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        logger.warning("Invalid trust store manifest at %s", manifest_path)
        return {}


def load_trust_store(
    roots_path: str | None,
    intermediates_path: str | None = None,
    *,
    name: str = "ICP-Brasil",
) -> TrustStore:
    """Load a versioned trust store, keeping anchors and intermediates apart."""
    roots = load_certificates(roots_path)
    intermediates = load_certificates(intermediates_path)

    fingerprints = sorted(_sha256_hex(c.dump()) for c in roots)
    bundle = hashlib.sha256()
    for cert in sorted(roots + intermediates, key=lambda c: _sha256_hex(c.dump())):
        bundle.update(cert.dump())

    manifest = _manifest(roots_path)
    store = TrustStore(
        name=manifest.get("name") or name,
        version=manifest.get("version") or bundle.hexdigest()[:12],
        roots=roots,
        intermediates=intermediates,
        bundle_sha256=bundle.hexdigest(),
        root_fingerprints=fingerprints,
        roots_path=str(roots_path or ""),
        intermediates_path=str(intermediates_path or ""),
        loaded_at=_now().isoformat(),
    )
    if not roots:
        logger.warning(
            "Trust store has no roots configured (roots_path=%s): chain cannot "
            "be trusted",
            roots_path or "<empty>",
        )
    return store


def _sha256_hex(der: bytes) -> str:
    return hashlib.sha256(der).hexdigest().upper()


# ── parsing helpers ──────────────────────────────────────────────────────────


def _load_signed_data(token_der: bytes) -> cms.SignedData:
    content_info = cms.ContentInfo.load(token_der)
    if content_info["content_type"].native != "signed_data":
        raise ValueError("token is not a CMS SignedData structure")
    return content_info["content"]


def _extract_tst_info(signed_data: cms.SignedData) -> tsp.TSTInfo:
    encap = signed_data["encap_content_info"]
    if encap["content_type"].native != "tst_info":
        raise ValueError("SignedData does not encapsulate a TSTInfo")
    tst = encap["content"].parsed
    if not isinstance(tst, tsp.TSTInfo):
        raise ValueError("encapsulated content is not a TSTInfo")
    return tst


def _imprint_bytes(tst: tsp.TSTInfo) -> bytes:
    value = tst["message_imprint"]["hashed_message"].native
    return bytes(value) if value is not None else b""


def _cert_info(cert: x509.Certificate) -> dict:
    return {
        "subject": cert.subject.rfc4514_string(),
        "issuer": cert.issuer.rfc4514_string(),
        "serial_number": format(cert.serial_number, "X"),
        "not_before": cert.not_valid_before_utc.isoformat(),
        "not_after": cert.not_valid_after_utc.isoformat(),
        "sha256_fingerprint": _sha256_hex(
            cert.public_bytes(serialization.Encoding.DER)
        ),
    }


def _cert_ref(cert: asn1_x509.Certificate) -> dict:
    """Compact reference for one certificate in the validated path."""
    crypto = x509.load_der_x509_certificate(cert.dump())
    return {
        "subject": crypto.subject.rfc4514_string(),
        "issuer": crypto.issuer.rfc4514_string(),
        "serial": format(crypto.serial_number, "X"),
        "sha256": _sha256_hex(cert.dump()),
    }


def _cert_valid_at(cert: x509.Certificate, moment: datetime) -> bool:
    return cert.not_valid_before_utc <= moment <= cert.not_valid_after_utc


def _eku_ok(cert: x509.Certificate, result: TimestampValidationResult) -> bool:
    try:
        ext = cert.extensions.get_extension_for_class(x509.ExtendedKeyUsage)
    except x509.ExtensionNotFound:
        return False
    if not ext.critical:
        result.warnings.append("EKU timeStamping presente, mas não marcada como crítica")
    return TIME_STAMPING_EKU in ext.value


# ── validator ────────────────────────────────────────────────────────────────


class TimestampValidator:
    """Validates RFC 3161 tokens against an explicit trust store."""

    def __init__(
        self,
        trust_roots: list[asn1_x509.Certificate] | None = None,
        expected_policy_oid: str | None = None,
        *,
        intermediates: list[asn1_x509.Certificate] | None = None,
        crls: list[asn1_crl.CertificateList] | None = None,
        revocation_mode: str = "soft-fail",
        allow_fetching: bool = False,
        trust_store: TrustStore | None = None,
    ) -> None:
        self.trust_roots = list(trust_roots or [])
        self.intermediates = list(intermediates or [])
        self.crls = list(crls or [])
        mode = (revocation_mode or "soft-fail").strip().lower()
        self.revocation_mode = mode if mode in VALID_REVOCATION_MODES else "soft-fail"
        self.allow_fetching = bool(allow_fetching)
        self.expected_policy_oid = (expected_policy_oid or "").strip()
        self.trust_store = trust_store
        self.trust_configured = bool(self.trust_roots)

    async def validate_token(
        self,
        token: bytes | bytearray | str | None,
        *,
        imprinted_data: bytes | None = None,
        expected_imprint: bytes | None = None,
    ) -> TimestampValidationResult:
        result = TimestampValidationResult(validated_at=_now().isoformat())
        if self.trust_store is not None:
            result.trust_store = self.trust_store.to_dict()

        token_der = _coerce_token_bytes(token)
        if not token_der:
            result.warnings.append("nenhum token RFC 3161 presente")
            return result

        result.token_present = True
        result.status = TOKEN_PRESENT

        try:
            signed_data = _load_signed_data(token_der)
            tst = _extract_tst_info(signed_data)
        except Exception as exc:  # noqa: BLE001 - malformed token is a real verdict
            result.errors.append(f"token parse error: {exc}")
            result.validation_status = ValidationStatus.INVALID.value
            return result

        result.token_parseable = True
        self._populate_structural(result, tst)

        expected_bytes = self._expected_imprint(tst, imprinted_data, expected_imprint)
        if expected_bytes is None:
            result.warnings.append(
                "message imprint não verificada: dados de origem ausentes"
            )
        else:
            result.message_imprint_valid = expected_bytes == _imprint_bytes(tst)

        await self._run_crypto_validation(
            result, signed_data, tst, expected_bytes=expected_bytes
        )
        self._finalize(result)
        return result

    async def validate_record(
        self,
        record,
        *,
        imprinted_data: bytes | None = None,
    ) -> TimestampValidationResult:
        """Validate a ``TimestampRecord`` and persist the structured outcome."""
        result = await self.validate_token(
            getattr(record, "token", None), imprinted_data=imprinted_data
        )
        apply_result_to_record(record, result)
        return result

    # ── internals ────────────────────────────────────────────────────────────

    def _populate_structural(
        self, result: TimestampValidationResult, tst: tsp.TSTInfo
    ) -> None:
        gen_time = _as_aware(tst["gen_time"].native)
        if gen_time is not None:
            result.gen_time = gen_time.isoformat()
            result.gen_time_sane = self._gen_time_sane(gen_time)
        result.policy_oid = (
            tst["policy"].dotted if tst["policy"].native is not None else None
        )
        imprint = tst["message_imprint"]
        result.message_imprint_algorithm = (
            imprint["hash_algorithm"]["algorithm"].native or None
        )
        result.message_imprint = _imprint_bytes(tst).hex() or None

    @staticmethod
    def _gen_time_sane(gen_time: datetime) -> bool:
        now = _now()
        if gen_time > now + CLOCK_SKEW:
            return False
        return gen_time >= EARLIEST_GEN_TIME

    def _expected_imprint(
        self,
        tst: tsp.TSTInfo,
        imprinted_data: bytes | None,
        expected_imprint: bytes | None,
    ) -> bytes | None:
        if expected_imprint is not None:
            return bytes(expected_imprint)
        if imprinted_data is None:
            return None
        algorithm = tst["message_imprint"]["hash_algorithm"]["algorithm"].native
        digest = _digest(algorithm, imprinted_data)
        if digest is None:
            logger.warning("Unsupported timestamp imprint algorithm: %s", algorithm)
        return digest

    async def _run_crypto_validation(
        self,
        result: TimestampValidationResult,
        signed_data: cms.SignedData,
        tst: tsp.TSTInfo,
        *,
        expected_bytes: bytes | None,
    ) -> None:
        from pyhanko.sign.validation.generic_cms import validate_tst_signed_data
        from pyhanko.sign.validation.status import TimestampSignatureStatus
        from pyhanko_certvalidator import ValidationContext

        token_imprint = _imprint_bytes(tst)

        def _imprint_provider(_algorithm: str) -> bytes:
            # When the origin data is unknown, feed the token's own imprint so
            # ``intact`` still reflects the CMS signature integrity (and the
            # imprint is reported separately as "não verificada").
            return expected_bytes if expected_bytes is not None else token_imprint

        gen_time = _as_aware(tst["gen_time"].native)
        # Supplied CRLs must actually be enforced: pyhanko's "soft-fail"/
        # "hard-fail" tolerate a revoked certificate, so require revocation
        # evidence whenever local CRLs are available. Without CRLs the chain is
        # still built (soft-fail) and revocation is reported as ``not_checked``.
        context_mode = "require" if self.crls else self.revocation_mode
        try:
            context = ValidationContext(
                trust_roots=self.trust_roots,
                other_certs=self.intermediates,
                moment=gen_time,
                allow_fetching=self.allow_fetching,
                crls=self.crls or None,
                revocation_mode=context_mode,
            )
            status = TimestampSignatureStatus(
                **await validate_tst_signed_data(
                    signed_data, context, _imprint_provider
                )
            )
        except Exception as exc:  # noqa: BLE001 - treat as a crypto verdict
            result.errors.append(f"CMS validation failed: {exc}")
            result.cms_signature_valid = False
            return

        result.cms_signature_valid = bool(status.valid)
        result.cms_integrity = bool(status.intact)
        if expected_bytes is not None:
            result.message_imprint_valid = (
                bool(status.intact) and expected_bytes == token_imprint
            )

        cert = x509.load_der_x509_certificate(status.signing_cert.dump())
        result.tsa_certificate = _cert_info(cert)
        result.extended_key_usage_valid = _eku_ok(cert, result)
        if gen_time is not None:
            result.certificate_valid_at_gen_time = _cert_valid_at(cert, gen_time)

        result.chain = self._chain_from_path(status)
        result.revocation = self._revocation_from_status(status)

        if self.trust_configured:
            result.chain_trusted = bool(status.trusted)
        else:
            result.chain_trusted = None
            result.warnings.append(
                "trust store de TSA/ACT não configurado: cadeia de confiança não verificada"
            )

        if self.expected_policy_oid:
            result.policy_check = "enforced"
            result.policy_valid = result.policy_oid == self.expected_policy_oid
        else:
            result.policy_check = "not_enforced"
            result.policy_valid = None
            result.warnings.append(
                "policy OID de TSA não configurada: verificação não aplicada"
            )

    def _chain_from_path(self, status) -> dict:
        path = status.validation_path
        problem = getattr(status.trust_problem_indic, "name", None) or (
            str(status.trust_problem_indic)
            if status.trust_problem_indic is not None
            else None
        )
        # pyhanko's path is anchor-first; expose it signer-first (as a chain).
        path_refs = [_cert_ref(cert) for cert in reversed(list(path))] if path else []
        return {
            "trusted": bool(status.trusted),
            "path_found": path is not None,
            "anchor": path_refs[-1]["subject"] if path_refs else None,
            "path": path_refs,
            "problem": problem,
            "validated_at": _now().isoformat(),
        }

    def _revocation_from_status(self, status) -> dict:
        details = getattr(status, "revocation_details", None)
        if details is not None:
            reason = getattr(details.revocation_reason, "name", None) or str(
                details.revocation_reason
            )
            return {
                "checked": True,
                "status": "revoked",
                "method": "crl_or_ocsp",
                "ca_revoked": bool(details.ca_revoked),
                "revoked_at": details.revocation_date.isoformat()
                if details.revocation_date
                else None,
                "reason": reason,
                "mode": self.revocation_mode,
            }

        enforced = self.revocation_mode in ("hard-fail", "require")
        have_sources = bool(self.crls) or self.allow_fetching
        problem = getattr(status.trust_problem_indic, "name", None) or ""
        revocation_problem = any(
            hint in problem.upper() for hint in _REVOCATION_PROBLEM_HINTS
        )

        if not have_sources:
            return {
                "checked": enforced,
                "status": "unavailable" if enforced else "not_checked",
                "method": None,
                "mode": self.revocation_mode,
                "crls": 0,
            }
        if revocation_problem:
            return {
                "checked": True,
                "status": "unavailable",
                "method": "crl" if self.crls else "ocsp",
                "mode": self.revocation_mode,
                "crls": len(self.crls),
                "problem": problem or None,
            }
        if status.trusted:
            return {
                "checked": True,
                "status": "good",
                "method": "crl" if self.crls else "ocsp",
                "mode": self.revocation_mode,
                "crls": len(self.crls),
            }
        return {
            "checked": True,
            "status": "unavailable",
            "method": "crl" if self.crls else "ocsp",
            "mode": self.revocation_mode,
            "crls": len(self.crls),
            "problem": problem or None,
        }

    @staticmethod
    def _finalize(result: TimestampValidationResult) -> None:
        if not result.token_parseable:
            result.validation_status = ValidationStatus.INVALID.value
            return

        explicit_false = any(
            value is False
            for value in (
                result.cms_signature_valid,
                result.cms_integrity,
                result.message_imprint_valid,
                result.extended_key_usage_valid,
                result.certificate_valid_at_gen_time,
                result.policy_valid,
                result.gen_time_sane,
            )
        )
        revocation_status = str(result.revocation.get("status") or "")

        if result.cms_signature_valid is False or result.cms_integrity is False:
            result.validation_status = ValidationStatus.INVALID.value
        elif explicit_false:
            result.validation_status = ValidationStatus.INVALID.value
        elif revocation_status == "revoked":
            result.validation_status = ValidationStatus.INVALID.value
        elif result.chain_trusted is False:
            result.validation_status = ValidationStatus.INVALID.value
        elif revocation_status == "unavailable":
            # Chain fine, crypto fine, but revocation evidence could not be
            # established under the requested policy: never "valid".
            result.validation_status = ValidationStatus.INDETERMINATE.value
        elif result.chain_trusted is True:
            result.validation_status = ValidationStatus.VALID.value
        else:
            result.validation_status = ValidationStatus.INDETERMINATE.value


def apply_result_to_record(record, result: TimestampValidationResult) -> None:
    """Project a validation result onto a ``TimestampRecord`` for audit."""
    record.status = result.status
    record.validation_status = result.validation_status
    record.validation_details = result.to_dict()
    record.validated_at = _now()
    if result.gen_time:
        try:
            record.gen_time = datetime.fromisoformat(result.gen_time)
        except ValueError:
            pass
    if result.message_imprint:
        record.message_imprint = result.message_imprint
    if result.message_imprint_algorithm:
        record.message_imprint_algorithm = result.message_imprint_algorithm
    if result.policy_oid:
        record.policy_oid = result.policy_oid


def build_validator_from_settings() -> TimestampValidator:
    """Build a validator from the API settings (trust store, CRLs, policy)."""
    from app.core.config import settings

    store = load_trust_store(
        getattr(settings, "TSA_TRUST_ROOTS_PATH", ""),
        getattr(settings, "TSA_INTERMEDIATES_PATH", ""),
    )
    crls = load_crls(getattr(settings, "TSA_CRL_PATH", ""))
    return TimestampValidator(
        trust_roots=store.roots,
        intermediates=store.intermediates,
        crls=crls,
        revocation_mode=getattr(settings, "TSA_REVOCATION_MODE", "soft-fail"),
        allow_fetching=getattr(settings, "TSA_ALLOW_FETCHING", False),
        expected_policy_oid=getattr(settings, "TSA_POLICY_OID", ""),
        trust_store=store,
    )
