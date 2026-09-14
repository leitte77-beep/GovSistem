"""Incremental PAdES Baseline signer backed by an A1 PKCS#12 credential.

The current implementation produces PAdES-B-B (ETSI.CAdES.detached).  It does
not claim ICP-Brasil AD-RB policy conformance unless a policy signed attribute
is actually embedded and independently validated.
"""

import hashlib
import io
import logging
import re
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from importlib.util import find_spec
from zoneinfo import ZoneInfo

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import pkcs12
from pypdf import PdfReader

from app.core.config import settings
from app.providers.base import SignatureProvider, SignedDocument

BRASILIA_TZ = ZoneInfo("America/Sao_Paulo")

FPDF_AVAILABLE = find_spec("fpdf") is not None

logger = logging.getLogger(__name__)

SIG_PLACEHOLDER_SIZE = 12288


@dataclass
class CertificateInspection:
    subject: str
    issuer: str
    serial_number: str
    valid_from: str
    valid_until: str
    is_a1: bool
    days_remaining: int
    sha256_fingerprint: str
    public_key_algorithm: str
    key_size: int
    policy_oids: list[str]


class PfxA1SignerProvider(SignatureProvider):
    """PAdES-B-B digital signer using an A1 certificate."""

    def __init__(self, pfx_bytes: bytes, password: str):
        self._password = password
        self._pfx_bytes = pfx_bytes
        self._key, self._cert, self._ca_certs = self._load_pfx(pfx_bytes, password)
        self._subject = self._cert.subject.rfc4514_string()
        self._serial = f"{self._cert.serial_number:x}".upper()
        self._clean_name = self._sanitize_name(self._subject)

    def _load_pfx(self, pfx_bytes: bytes, password: str):
        kc = pkcs12.load_key_and_certificates(pfx_bytes, password.encode("utf-8"))
        pk, cert, cas = kc
        if pk is None or cert is None:
            raise ValueError("PFX must contain a private key and certificate")
        return pk, cert, cas or []

    @staticmethod
    def _sanitize_name(dn: str) -> str:
        """Clean certificate name: extract CN, remove CNPJ/CPF/technical terms."""
        m = re.search(r'CN=([^,]+)', dn)
        if not m:
            return "ASSINANTE DIGITAL"
        name = m.group(1)
        name = re.sub(r':\d{14}.*', '', name)
        name = re.sub(r':\d{11}.*', '', name)
        name = re.sub(r'\d{14,}', '', name)
        name = re.sub(r'\d{11}', '', name)
        name = re.sub(r'[,;:].*', '', name)
        name = name.strip()
        name = name.replace('MUNICIPIO', 'MUNICÍPIO')
        for term in ['RFB', 'e-CNPJ', 'e-CPF', 'A1', 'Secretaria da Receita Federal',
                     'Certificado Digital', 'Certificado PF', 'Certificado PJ']:
            name = name.replace(term, '')
        name = re.sub(r'\s+', ' ', name).strip()
        if not name or len(name) < 3:
            return "ASSINANTE DIGITAL"
        return name[:60]

    def inspect(self) -> CertificateInspection:
        """Inspect certificate and return detailed information."""
        now = datetime.now(timezone.utc)
        valid_until = self._cert.not_valid_after_utc
        days_remaining = (valid_until - now).days

        pub = self._cert.public_key()
        try:
            key_size = pub.key_size
            algo = pub.__class__.__name__.replace("PublicKey", "").replace("_", "").upper()
        except Exception:
            logger.warning("Could not determine key_size/algorithm", exc_info=True)
            key_size = 0
            algo = "UNKNOWN"

        try:
            from cryptography.x509 import CertificatePolicies
            policy_oids = []
            for ext in self._cert.extensions:
                if isinstance(ext.value, CertificatePolicies):
                    for p in ext.value:
                        policy_oids.append(p.policy_identifier.dotted_string)
        except Exception:
            logger.warning("Could not read certificate policy OIDs", exc_info=True)
            policy_oids = []

        fp = hashlib.sha256(self._cert.public_bytes(serialization.Encoding.DER)).hexdigest().upper()

        return CertificateInspection(
            subject=self._subject,
            issuer=self._cert.issuer.rfc4514_string(),
            serial_number=self._serial,
            valid_from=self._cert.not_valid_before_utc.isoformat(),
            valid_until=valid_until.isoformat(),
            is_a1=self._is_a1_certificate(policy_oids),
            days_remaining=days_remaining,
            sha256_fingerprint=fp,
            public_key_algorithm=algo,
            key_size=key_size,
            policy_oids=policy_oids,
        )

    def _is_a1_certificate(self, policy_oids: list[str] | None = None) -> bool:
        """Check if certificate is ICP-Brasil A1 type by examining policy OIDs.

        A1 certificates have OIDs in the range 2.16.76.1.2.1.n
        """
        if policy_oids is None:
            try:
                from cryptography.x509 import CertificatePolicies
                policy_oids = []
                for ext in self._cert.extensions:
                    if isinstance(ext.value, CertificatePolicies):
                        for p in ext.value:
                            policy_oids.append(p.policy_identifier.dotted_string)
            except Exception:
                logger.warning(
                    "Could not read certificate policies, defaulting to A1=true",
                    exc_info=True,
                )
                return True  # Default to True if policies are unavailable

        for oid in policy_oids:
            if oid.startswith("2.16.76.1.2.1."):
                return True
        return len(policy_oids) == 0  # Unknown = allow (dev mode)

    def sign(
        self, pdf_bytes: bytes, visible: bool = False,
        reason: str = "", location: str = "",
        verification_code: str = "",
    ) -> SignedDocument:
        """Apply a REAL incremental PAdES signature using pyHanko.

        - The input PDF is NOT rebuilt, repaginated, scaled or merged.
        - Signing uses IncrementalPdfFileWriter: the original bytes remain the
          base revision and only an incremental signature revision is appended.
        - A real /Sig dictionary with /ByteRange and a CMS in /Contents is added.
        - If ``visible`` is False (default) no visible appearance is added, so
          the rendered pages are byte-identical (no reflow).
        """
        from io import BytesIO

        from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
        from pyhanko.sign.fields import SigFieldSpec, SigSeedSubFilter
        from pyhanko.sign.signers import PdfSignatureMetadata, PdfSigner, SimpleSigner

        # SimpleSigner.load_pkcs12 expects a filesystem path.
        with tempfile.NamedTemporaryFile(suffix=".pfx", delete=True) as tmp:
            tmp.write(self._pfx_bytes)
            tmp.flush()
            signer = SimpleSigner.load_pkcs12(
                tmp.name, passphrase=self._password.encode("utf-8")
            )
        field_name = "Signature1"
        meta = PdfSignatureMetadata(
            field_name=field_name,
            md_algorithm="sha256",
            subfilter=SigSeedSubFilter.PADES,
            reason=reason or "Assinatura Digital - Diário Oficial Eletrônico",
            location=location or "",
            cades_signed_attr_spec=self._policy_attr_spec(),
        )
        field_spec = None
        if visible:
            # Place a small visible signature in a reserved box at the bottom
            # right of the LAST page. Because signing is incremental, no page
            # content is reflowed; only the appearance is overlaid in the box.
            reader = PdfReader(BytesIO(pdf_bytes))
            last = reader.pages[-1]
            mb = last.mediabox
            pw = float(mb.width)
            box = (int(pw - 220), int(20), int(pw - 20), int(110))
            field_spec = SigFieldSpec(
                sig_field_name=field_name,
                on_page=len(reader.pages) - 1,
                box=box,
            )
        # RFC 3161 timestamp (ACT): when configured, the TSA token is embedded
        # in the CMS as an unsigned attribute, which is what makes a PAdES
        # signature time-verifiable beyond the local clock.
        timestamper = None
        if settings.TSA_URL:
            from pyhanko.sign.timestamps import HTTPTimeStamper

            timestamper = HTTPTimeStamper(settings.TSA_URL)

        pdf_signer = PdfSigner(
            meta, signer, new_field_spec=field_spec, timestamper=timestamper
        )
        w = IncrementalPdfFileWriter(BytesIO(pdf_bytes))
        out = pdf_signer.sign_pdf(w)
        out.seek(0)
        signed = out.read()

        now = datetime.now(timezone.utc).isoformat()
        ci = self.get_certificate_info()
        return SignedDocument(
            content=signed,
            certificate_info=ci,
            signature_time=now,
            signature_format="PAdES",
            verification_code=verification_code,
            timestamped=bool(timestamper),
        )

    def verify(self, pdf_bytes: bytes) -> bool:
        # Local post-sign integrity check: the CMS must be cryptographically
        # intact over the /ByteRange (i.e. no corruption/truncation). Chain
        # trust is validated separately (with ICP-Brasil roots) on demand.
        det = self.verify_detailed(pdf_bytes)
        signatures = det.get("signatures", [])
        return bool(
            det.get("valid")
            and signatures
            and all(s.get("intact") and s.get("valid") for s in signatures)
        )

    def verify_detailed(self, pdf_bytes: bytes) -> dict:
        """Cryptographically validate every signature field in the PDF.

        Uses pyHanko's validator: checks presence of /Sig, integrity of the
        CMS signature over the /ByteRange (detects any single-byte change after
        signing) and certificate chain against the provided trust store.
        """
        result = {
            "valid": False,
            "signatures": [],
            "errors": [],
            "warnings": [],
        }
        try:
            from pyhanko.pdf_utils.reader import PdfFileReader
            from pyhanko.sign.validation import validate_pdf_signature
            from pyhanko_certvalidator import ValidationContext

            # Deterministic validation: use ICP-Brasil roots when available,
            # otherwise no OS trust list is consulted (explicit empty trust).
            roots = []
            try:
                from app.providers import get_icp_validator
                roots = get_icp_validator()._trust_roots or []
            except Exception:  # noqa: BLE001
                roots = []
            # pyhanko-certvalidator 0.32 expects asn1crypto certificates in the
            # trust store (cryptography's Name has no ``.hashable``); convert so
            # chain validation against the ICP-Brasil roots actually runs.
            try:
                import asn1crypto.x509 as _asn1_x509

                roots = [
                    _asn1_x509.Certificate.load(
                        r.public_bytes(serialization.Encoding.DER)
                    )
                    for r in roots
                ]
            except Exception:  # noqa: BLE001 - never break integrity check
                pass
            reader = PdfFileReader(io.BytesIO(pdf_bytes))
            vc = ValidationContext(trust_roots=roots)
            emb_sigs = list(reader.embedded_signatures)
            all_ok = True
            for emb in emb_sigs:
                entry = {
                    "name": getattr(emb, "field_name", "") or "",
                    "filter": str(emb.sig_object.get("/Filter", "")),
                    "subfilter": str(emb.sig_object.get("/SubFilter", "")),
                    "reason": str(emb.sig_object.get("/Reason", "")),
                    "location": str(emb.sig_object.get("/Location", "")),
                    "signing_time": str(emb.sig_object.get("/M", "")),
                    "byte_range": list(emb.sig_object.get("/ByteRange", [])),
                    "intact": False,
                    "valid": False,
                    "format_ok": False,
                    "trusted": False,
                }
                try:
                    status = validate_pdf_signature(emb, vc)
                    entry["intact"] = bool(status.intact)
                    entry["valid"] = bool(status.valid)
                    entry["format_ok"] = entry["subfilter"] == "/ETSI.CAdES.detached"
                    entry["trusted"] = bool(getattr(status, "trusted", False))
                    if not status.intact or not status.valid or not entry["format_ok"]:
                        all_ok = False
                        entry["errors"] = [str(e) for e in (status.errors or [])]
                except Exception as exc:  # noqa: BLE001
                    all_ok = False
                    entry["errors"] = [f"validation exception: {exc}"]
                    result["warnings"].append(str(exc))
                result["signatures"].append(entry)

            if not emb_sigs:
                result["warnings"].append("Nenhuma assinatura encontrada")
                all_ok = False
            result["valid"] = all_ok
        except Exception as e:  # noqa: BLE001
            logger.warning("Detailed signature verification failed: %s", e, exc_info=True)
            result["errors"].append(str(e))
        return result

    def _policy_attr_spec(self):
        """Build the CAdES signature-policy attribute, when fully configured.

        A PAdES signature policy is only embedded when the OID, the SHA-256 of
        the official policy document and its URI are all provided (from ITI).
        Never invents a policy hash: incomplete config => no policy embedded.
        """
        oid = (settings.SIGNER_POLICY_OID or "").strip()
        digest_hex = (settings.SIGNER_POLICY_HASH or "").strip()
        uri = (settings.SIGNER_POLICY_URI or "").strip()
        if not (oid and digest_hex and uri):
            return None
        try:
            from pyhanko.sign.ades.api import CAdESSignedAttrSpec
            from pyhanko.sign.ades.cades_asn1 import SignaturePolicyIdentifier

            digest = bytes.fromhex(digest_hex)
            sp = SignaturePolicyIdentifier({
                "signature_policy_id": {
                    "sig_policy_id": oid,
                    "sig_policy_hash": {
                        "digest_algorithm": {"algorithm": "sha256"},
                        "digest": digest,
                    },
                    "sig_policy_qualifiers": [
                        {
                            "sig_policy_qualifier_id": "sp_uri",
                            "sig_qualifier": uri,
                        },
                    ],
                }
            })
            return CAdESSignedAttrSpec(signature_policy_identifier=sp)
        except Exception as e:  # noqa: BLE001
            logger.warning("Failed to build PAdES signature policy: %s", e)
            return None

    def _effective_policy_oid(self) -> str:
        """The policy OID actually embedded (empty when not fully configured)."""
        if self._policy_attr_spec() is None:
            return ""
        return (settings.SIGNER_POLICY_OID or "").strip()

    def get_certificate_info(self) -> dict:
        return {
            "provider": "a1",
            "format": "PAdES-B-B",
            "policy_oid": self._effective_policy_oid(),
            "subject": self._subject,
            "serial": self._serial,
            "issuer": self._cert.issuer.rfc4514_string(),
            "valid_from": self._cert.not_valid_before_utc.isoformat(),
            "valid_to": self._cert.not_valid_after_utc.isoformat(),
            "thumbprint": hashlib.sha1(
                self._cert.public_bytes(serialization.Encoding.DER)
            ).hexdigest().upper(),
            "sha256_fingerprint": hashlib.sha256(
                self._cert.public_bytes(serialization.Encoding.DER)
            ).hexdigest().upper(),
        }

    def __del__(self):
        self._password = None
        self._pfx_bytes = None

    def validate_icp_brasil(self) -> dict:
        """Run full ICP-Brasil validation chain."""
        from app.providers import get_icp_validator

        validator = get_icp_validator()
        result = validator.validate(self._cert, self._ca_certs)

        return {
            "valid": result.valid,
            "chain_valid": result.chain_valid,
            "not_expired": result.not_expired,
            "not_revoked": result.not_revoked,
            "is_a1_type": result.is_a1_type,
            "errors": result.errors,
            "warnings": result.warnings,
        }
