"""ICP-Brasil certificate chain validation and revocation checking.

Supports:
- PKIX chain validation against ICP-Brasil root CAs
- CRL fetching and serial checking
- OCSP checking (RFC 6960)
- A1 policy detection

Revocation sources are only consulted when reachable; an *unreachable* source
is reported as "not checked" and never silently treated as "not revoked". A
certificate actually listed as revoked always fails validation.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import httpx
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.x509 import (
    AuthorityInformationAccess,
    AuthorityInformationAccessOID,
    CertificatePolicies,
    ExtensionNotFound,
    load_der_x509_crl,
    load_pem_x509_crl,
)
from cryptography.x509.ocsp import (
    OCSPCertStatus,
    OCSPRequestBuilder,
    OCSPResponseStatus,
    load_der_ocsp_response,
)
from cryptography.x509.verification import PolicyBuilder, Store, VerificationError

from app.core.config import settings

logger = logging.getLogger(__name__)

_REVOCATION_REASONS = {
    "unspecified": "não especificado",
    "key_compromise": "comprometimento de chave",
    "ca_compromise": "comprometimento da CA",
    "affiliation_changed": "mudança de vínculo",
    "superseded": "substituído",
    "cessation_of_operation": "cessação de operação",
    "certificate_hold": "suspenso",
    "privilege_withdrawn": "privilégio revogado",
    "aa_compromise": "comprometimento da AA",
}


@dataclass
class ValidationResult:
    valid: bool
    chain_valid: bool = False
    not_expired: bool = False
    not_revoked: bool = True
    revocation_checked: bool = False
    revocation_method: str = ""
    is_a1_type: bool = False
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class IcpBrasilValidator:
    """Validates certificates against ICP-Brasil chain and policies."""

    A1_POLICY_PREFIX = "2.16.76.1.2.1."
    AD_RB_POLICY_OID = "2.16.76.1.7.1.11.1.3"

    def __init__(self, strict_mode: bool = True):
        self.strict_mode = strict_mode
        self._trust_roots: list[x509.Certificate] = []
        self._crl_cache: dict[str, Optional[x509.CertificateRevocationList]] = {}
        self._ocsp_cache: dict[str, Optional[tuple[str, str]]] = {}

    # ── Trust store ─────────────────────────────────────────────────────────

    def load_trust_roots(self, pem_data: str) -> int:
        """Load ICP-Brasil root certificates from a PEM string."""
        count = 0
        for cert_bytes in self._split_pem(pem_data):
            try:
                cert = x509.load_pem_x509_certificate(cert_bytes.encode("utf-8"))
                self._trust_roots.append(cert)
                count += 1
            except Exception as e:  # noqa: BLE001
                logger.warning("Failed to load trust root: %s", e)
        return count

    def load_trust_roots_from_path(self, path: str) -> int:
        with open(path, "r", encoding="utf-8") as f:
            return self.load_trust_roots(f.read())

    def _split_pem(self, pem_data: str) -> list[str]:
        certs: list[str] = []
        current: list[str] = []
        for line in pem_data.split("\n"):
            current.append(line)
            if line.strip() == "-----END CERTIFICATE-----":
                certs.append("\n".join(current))
                current = []
        return certs

    # ── Full validation ─────────────────────────────────────────────────────

    def validate(
        self,
        cert: x509.Certificate,
        ca_chain: list[x509.Certificate] | None = None,
    ) -> ValidationResult:
        """Full ICP-Brasil validation of a certificate."""
        result = ValidationResult(valid=False)

        # 1. Expiry
        now = datetime.now(timezone.utc)
        if cert.not_valid_before_utc <= now <= cert.not_valid_after_utc:
            result.not_expired = True
        else:
            expired = now > cert.not_valid_after_utc
            msg = f"Certificado {'expirou' if expired else 'ainda não é válido'}"
            result.errors.append(msg)
            if self.strict_mode:
                return result

        # 2. A1 type
        result.is_a1_type = self._check_a1_type(cert)
        if not result.is_a1_type:
            msg = "Certificado não é do tipo A1 (ICP-Brasil)"
            result.warnings.append(msg)
            if self.strict_mode:
                result.errors.append(msg)

        # 3. PKIX chain
        if self._trust_roots:
            chain_ok, chain_err = self._validate_chain(cert, ca_chain)
            result.chain_valid = chain_ok
            if not chain_ok:
                result.errors.append(f"Cadeia de certificação: {chain_err}")
        else:
            result.warnings.append(
                "Nenhuma raiz ICP-Brasil configurada para validação de cadeia"
            )

        # 4. Revocation
        rev_ok, rev_checked, rev_detail, rev_method = self._check_revocation(
            cert, ca_chain
        )
        result.revocation_checked = rev_checked
        result.revocation_method = rev_method
        if rev_checked and not rev_ok:
            result.not_revoked = False
            result.errors.append(f"Revogação: {rev_detail}")
        elif not rev_checked:
            result.warnings.append(f"Revogação não verificada: {rev_detail}")

        result.valid = (
            result.not_expired
            and result.not_revoked
            and (result.chain_valid or not self._trust_roots)
        )
        return result

    def _check_a1_type(self, cert: x509.Certificate) -> bool:
        try:
            policies = cert.extensions.get_extension_for_class(CertificatePolicies)
            for policy in policies.value:
                if policy.policy_identifier.dotted_string.startswith(
                    self.A1_POLICY_PREFIX
                ):
                    return True
            return False
        except ExtensionNotFound:
            return True  # No policies exposed: do not block (dev/self-signed).

    def _validate_chain(
        self,
        cert: x509.Certificate,
        ca_chain: list[x509.Certificate] | None,
    ) -> tuple[bool, str]:
        try:
            store = Store(self._trust_roots)
            verifier = PolicyBuilder().store(store).build_algorithm()
            intermediates = [c for c in (ca_chain or []) if c != cert]
            verifier.verify([cert] + intermediates, datetime.now(timezone.utc))
            return True, ""
        except VerificationError as e:
            return False, str(e)
        except Exception as e:  # noqa: BLE001
            return False, f"Erro na validação: {e}"

    # ── Revocation ──────────────────────────────────────────────────────────

    def _check_revocation(
        self,
        cert: x509.Certificate,
        ca_chain: list[x509.Certificate] | None,
    ) -> tuple[bool, bool, str, str]:
        """Return ``(not_revoked, checked, detail, method)``.

        ``checked`` is True only when a real CRL/OCSP answer was obtained and
        evaluated. A revoked certificate always yields ``not_revoked=False``.
        """
        mode = (settings.REVOCATION_MODE or "off").strip().lower()
        if mode == "off":
            return True, False, "verificação de revogação desativada", ""

        details: list[str] = []
        checked = False

        if mode in ("crl", "both"):
            ok, did_check, detail = self._check_crl(cert, ca_chain)
            details.append(f"CRL: {detail}")
            checked = checked or did_check
            if did_check and not ok:
                return False, True, detail, "crl"

        if mode in ("ocsp", "both"):
            ok, did_check, detail = self._check_ocsp(cert, ca_chain)
            details.append(f"OCSP: {detail}")
            checked = checked or did_check
            if did_check and not ok:
                return False, True, detail, "ocsp"

        if not checked:
            return True, False, "; ".join(details), ""
        return True, True, "certificado não consta como revogado", mode

    def _crl_urls(self, cert: x509.Certificate) -> list[str]:
        try:
            ext = cert.extensions.get_extension_for_class(
                x509.CRLDistributionPoints
            )
            return [uri.value for dp in ext.value for uri in dp.full_name]
        except ExtensionNotFound:
            return []

    def _fetch_crl(self, url: str):
        if url in self._crl_cache:
            return self._crl_cache[url]
        crl = None
        try:
            # TLS verification stays ON: a tampered CRL must not be trusted.
            resp = httpx.get(url, timeout=settings.REVOCATION_TIMEOUT)
            resp.raise_for_status()
            raw = resp.content
            try:
                crl = load_der_x509_crl(raw)
            except Exception:  # noqa: BLE001 - may be PEM
                crl = load_pem_x509_crl(raw)
        except Exception as e:  # noqa: BLE001
            logger.debug("CRL fetch failed for %s: %s", url, e)
            crl = None
        self._crl_cache[url] = crl
        return crl

    def _check_crl(
        self,
        cert: x509.Certificate,
        ca_chain: list[x509.Certificate] | None,
    ) -> tuple[bool, bool, str]:
        urls = self._crl_urls(cert)
        if not urls:
            return True, False, "certificado sem CRLDistributionPoints"

        tried = False
        for url in urls:
            crl = self._fetch_crl(url)
            if crl is None:
                continue
            tried = True
            revoked = crl.get_revoked_certificate_by_serial_number(
                cert.serial_number
            )
            if revoked is not None:
                reason = getattr(revoked, "reason", None)
                reason_name = getattr(reason, "name", None) or "unspecified"
                reason_pt = _REVOCATION_REASONS.get(reason_name, reason_name)
                return (
                    False,
                    True,
                    f"revogado por CRL em {revoked.revocation_date_utc.isoformat()} ({reason_pt})",
                )
        if not tried:
            return True, False, "não foi possível baixar a CRL"
        return True, True, "não consta na CRL"

    def _ocsp_url(self, cert: x509.Certificate) -> Optional[str]:
        try:
            ext = cert.extensions.get_extension_for_class(AuthorityInformationAccess)
            for desc in ext.value:
                if desc.access_method == AuthorityInformationAccessOID.OCSP:
                    return desc.access_location.value
        except ExtensionNotFound:
            return None
        return None

    def _check_ocsp(
        self,
        cert: x509.Certificate,
        ca_chain: list[x509.Certificate] | None,
    ) -> tuple[bool, bool, str]:
        url = self._ocsp_url(cert)
        if not url:
            return True, False, "certificado sem OCSP responder (AIA)"

        chain = ca_chain or []
        issuer = next((c for c in chain if c.subject == cert.issuer), None)
        if issuer is None and cert.issuer == cert.subject:
            issuer = cert  # self-signed: the certificate is its own issuer
        if issuer is None:
            return True, False, "certificado emissor ausente para montar o OCSP"

        cache_key = f"{url}:{cert.serial_number:x}"
        if cache_key in self._ocsp_cache:
            cached = self._ocsp_cache[cache_key]
            if cached is None:
                return True, False, "resposta OCSP indisponível"
            status, detail = cached
            return status == "good", True, detail

        try:
            builder = (
                OCSPRequestBuilder()
                .add_certificate(cert, issuer, hashes.SHA1())
                .build()
            )
            resp = httpx.post(
                url,
                content=builder.public_bytes(serialization.Encoding.DER),
                headers={"Content-Type": "application/ocsp-request"},
                timeout=settings.REVOCATION_TIMEOUT,
            )
            resp.raise_for_status()
            ocsp_resp = load_der_ocsp_response(resp.content)
        except Exception as e:  # noqa: BLE001
            logger.debug("OCSP request failed for %s: %s", url, e)
            self._ocsp_cache[cache_key] = None
            return True, False, f"falha na consulta OCSP: {e}"

        if ocsp_resp.response_status != OCSPResponseStatus.SUCCESSFUL:
            self._ocsp_cache[cache_key] = None
            return True, False, f"OCSP response status: {ocsp_resp.response_status}"

        if ocsp_resp.certificate_status == OCSPCertStatus.REVOKED:
            detail = (
                "revogado por OCSP em "
                f"{ocsp_resp.revocation_time_utc.isoformat()}"
            )
            self._ocsp_cache[cache_key] = ("revoked", detail)
            return False, True, detail
        if ocsp_resp.certificate_status == OCSPCertStatus.UNKNOWN:
            self._ocsp_cache[cache_key] = ("unknown", "certificado desconhecido pelo responder")
            return True, False, "certificado desconhecido pelo responder OCSP"
        self._ocsp_cache[cache_key] = ("good", "OCSP respondeu GOOD")
        return True, True, "OCSP respondeu GOOD"

    def verify_signature_policy(self, cert: x509.Certificate) -> tuple[bool, str]:
        """Check whether the certificate carries the AD-RB policy OID."""
        try:
            policies = cert.extensions.get_extension_for_class(CertificatePolicies)
            for policy in policies.value:
                if policy.policy_identifier.dotted_string == self.AD_RB_POLICY_OID:
                    return True, ""
            return False, "Política de assinatura AD-RB não encontrada no certificado"
        except ExtensionNotFound:
            return False, "Certificado sem política de assinatura"
