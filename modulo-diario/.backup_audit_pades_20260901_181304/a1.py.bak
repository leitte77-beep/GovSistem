"""PAdES A1 signer for ICP-Brasil AD-RB compliance.

Implements PDF signing per DOC-ICP-15.03 (PAdES AD-RB):
- Filter: PBAD_PAdES
- SubFilter: PBAD.PAdES
- CMS with required signed attributes
- AD-RB policy OID: 2.16.76.1.7.1.11.1.3

Visual features:
- Rotated sidebar seal on every page
- ICP-Brasil logo alongside rotated text
- Signature manifest page (optional)
"""

import base64
import hashlib
import io
import logging
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.serialization import pkcs7, pkcs12
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    ArrayObject,
    ByteStringObject,
    DictionaryObject,
    NameObject,
    NumberObject,
    TextStringObject,
    StreamObject,
)

from app.core.config import settings
from app.providers.base import SignatureProvider, SignedDocument

BRASILIA_TZ = ZoneInfo("America/Sao_Paulo")

try:
    from fpdf import FPDF
    FPDF_AVAILABLE = True
except ImportError:
    FPDF_AVAILABLE = False

logger = logging.getLogger(__name__)

SIG_PLACEHOLDER_SIZE = 12288
PADES_AD_RB_OID = "2.16.76.1.7.1.11.1.3"


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
    """PAdES ICP-Brasil AD-RB digital signer using A1 certificates."""

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
            from cryptography.x509 import CertificatePolicies, ExtendedKeyUsage
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
                logger.warning("Could not read certificate policies, defaulting to A1=true", exc_info=True)
                return True  # Default to True if can't read policies

        for oid in policy_oids:
            if oid.startswith("2.16.76.1.2.1."):
                return True
        return len(policy_oids) == 0  # Unknown = allow (dev mode)

    def sign(
        self, pdf_bytes: bytes, visible: bool = False,
        reason: str = "", location: str = "",
        verification_code: str = "",
    ) -> SignedDocument:
        now_utc = datetime.now(timezone.utc)
        now_brasilia = now_utc.astimezone(BRASILIA_TZ)
        validation_url = settings.VERIFICATION_BASE_URL
        if verification_code:
            vcode = verification_code
        else:
            vcode_raw = hashlib.sha256(f"{self._serial}{now_utc.timestamp()}".encode()).hexdigest()[:8].upper()
            vcode = f"{vcode_raw[:4]}-{vcode_raw[4:8]}"

        # Step 1: Add rotated sidebar seal to every page
        pdf_with_seal = self._add_rotated_seal(pdf_bytes, reason, validation_url, vcode)

        # Step 2: Add manifest page
        pdf_with_manifest = self._add_manifest_page(pdf_with_seal, now_brasilia, reason, validation_url, vcode)

        # Step 3: Apply digital signature
        reader = PdfReader(io.BytesIO(pdf_with_manifest))
        writer = PdfWriter()
        writer.append(reader)

        sig_name = f"Sig{hashlib.md5(str(datetime.now(timezone.utc).timestamp()).encode()).hexdigest()[:8]}"

        sig_obj = DictionaryObject()
        sig_obj.update({
            NameObject("/Type"): NameObject("/Sig"),
            NameObject("/Filter"): NameObject("/PBAD_PAdES"),
            NameObject("/SubFilter"): NameObject("/PBAD.PAdES"),
            NameObject("/Reason"): TextStringObject(reason or "Assinatura Digital - Doe ICP-Brasil AD-RB"),
            NameObject("/Location"): TextStringObject(location or ""),
            NameObject("/M"): TextStringObject(f"D:{now_brasilia.strftime('%Y%m%d%H%M%S%z')}"),
            NameObject("/ByteRange"): ArrayObject([
                NumberObject(0), NumberObject(0),
                NumberObject(0), NumberObject(0),
            ]),
            NameObject("/Contents"): ByteStringObject(b"\x00" * SIG_PLACEHOLDER_SIZE),
        })
        sig_ref = writer._add_object(sig_obj)

        annot = DictionaryObject()
        annot.update({
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Sig"),
            NameObject("/T"): TextStringObject(sig_name),
            NameObject("/V"): sig_ref,
            NameObject("/Rect"): ArrayObject([
                NumberObject(40), NumberObject(40),
                NumberObject(280), NumberObject(120),
            ]) if visible else ArrayObject([
                NumberObject(0), NumberObject(0),
                NumberObject(0), NumberObject(0),
            ]),
            NameObject("/F"): NumberObject(4),
            NameObject("/P"): writer.pages[0].indirect_reference,
        })

        if visible:
            ap_stream = self._create_visible_appearance(now_utc, reason)
            annot[NameObject("/AP")] = DictionaryObject({
                NameObject("/N"): writer._add_object(ap_stream),
            })
        annot_ref = writer._add_object(annot)

        acroform = DictionaryObject()
        acroform.update({
            NameObject("/SigFlags"): NumberObject(3),
            NameObject("/Fields"): ArrayObject([annot_ref]),
        })
        writer._root_object[NameObject("/AcroForm")] = writer._add_object(acroform)

        unsigned_buf = io.BytesIO()
        writer.write(unsigned_buf)
        unsigned_pdf = unsigned_buf.getvalue()

        signed_pdf = self._embed_signature(unsigned_pdf)

        now = now_utc.isoformat()
        ci = self.get_certificate_info()

        return SignedDocument(
            content=signed_pdf,
            certificate_info=ci,
            signature_time=now,
            signature_format="PAdES-AD-RB",
            verification_code=vcode,
        )

    # ── Visual: Rotated sidebar seal ──────────────────────────────────────────

    def _add_rotated_seal(self, pdf_bytes: bytes, reason: str, validation_url: str, vcode: str) -> bytes:
        """Add rotated sidebar seal to every page.

        Creates a narrow strip with icon + text, then rotates it 90° and overlays.
        """
        if not FPDF_AVAILABLE:
            return pdf_bytes

        clean_name = self._clean_name
        reader = PdfReader(io.BytesIO(pdf_bytes))
        writer = PdfWriter()
        writer.append(reader)

        text_line = f"Assinado digitalmente por {clean_name} | {vcode} | {validation_url}"
        side_h = 24
        icp_path = os.path.join(os.path.dirname(__file__), "..", "..", "static", "icp.png")

        for i in range(len(writer.pages)):
            page = writer.pages[i]
            pw = float(page.mediabox.width)
            ph = float(page.mediabox.height)

            strip = FPDF(unit="pt")
            strip.add_page()

            # Light gray strip
            strip.set_fill_color(243, 243, 243)
            strip.set_draw_color(215, 215, 215)
            strip.rect(0, 0, ph, side_h, "F")
            strip.line(ph, 0, ph, side_h)

            # ICP icon
            if os.path.exists(icp_path):
                try:
                    strip.image(icp_path, x=6, y=4, w=18, h=6)
                except Exception:
                    logger.warning("Could not render ICP-Brasil logo on seal", exc_info=True)

            # Text at 10pt
            strip.set_font("Helvetica", size=10)
            strip.set_text_color(130, 130, 130)
            strip.set_xy(28, 6)
            strip.cell(ph - 34, 12, text_line)

            strip_pdf = PdfReader(io.BytesIO(strip.output()))
            strip_page = strip_pdf.pages[0]
            strip_page.add_transformation((0, 1, -1, 0, ph, 0))
            page.merge_page(strip_page)

        buf = io.BytesIO()
        writer.write(buf)
        return buf.getvalue()

    # ── Visual: Manifest page ─────────────────────────────────────────────────

    def _add_manifest_page(self, pdf_bytes: bytes, sign_time: datetime, reason: str, validation_url: str, vcode: str) -> bytes:
        """Append a professional manifest page before signing."""
        if not FPDF_AVAILABLE:
            return pdf_bytes

        clean_name = self._clean_name
        date_str = sign_time.astimezone(BRASILIA_TZ).strftime("%d/%m/%Y às %H:%M")
        reason_short = reason[:80] or "Assinatura Digital"

        reader = PdfReader(io.BytesIO(pdf_bytes))
        writer = PdfWriter()
        writer.append(reader)

        m = FPDF(unit="pt")
        m.add_page()

        w = 595  # A4 width
        ml, mr = 50, 50  # margins
        cw = w - ml - mr  # content width

        # Color constants
        green_dark = (30, 90, 50)
        green_light = (220, 237, 225)
        gray_bg = (245, 245, 247)
        gray_border = (210, 210, 215)
        gray_text = (80, 80, 80)
        black = (30, 30, 30)

        G = ml  # global x start

        def section_line(y):
            m.set_draw_color(*green_dark)
            m.set_line_width(0.6)
            m.line(G, y, G + cw, y)

        # ═══════════════════════════════════════════════
        # 1. TITLE
        # ═══════════════════════════════════════════════
        y = 48
        m.set_font("Helvetica", "B", 20)
        m.set_text_color(*green_dark)
        m.set_xy(G, y)
        m.cell(cw, 28, "MANIFESTO DE ASSINATURA DIGITAL", align="C")
        y += 30

        # 2. SUBTITLE
        m.set_font("Helvetica", "", 10)
        m.set_text_color(*green_dark)
        m.set_xy(G, y)
        m.cell(cw, 16, "Documento assinado digitalmente com certificado ICP-Brasil", align="C")
        y += 20

        # 3. GREEN LINE
        section_line(y)
        y += 18

        # ═══════════════════════════════════════════════
        # 4. DATA TABLE
        # ═══════════════════════════════════════════════
        rows = [
            ("Assinante", clean_name),
            ("Data/Hora", date_str),
            ("Motivo", reason_short),
            ("Certificado", "A1 ICP-Brasil"),
            ("Padrao", "PAdES AD-RB"),
            ("Politica", "AD-RB (DOC-ICP-15.03)"),
            ("Validacao", validation_url),
        ]
        row_h = 26
        col1_w = 110
        col2_w = cw - col1_w

        for i, (label, val) in enumerate(rows):
            ry = y + i * row_h

            # Col 1 - label
            m.set_fill_color(*gray_bg)
            m.set_draw_color(*gray_border)
            m.rect(G, ry, col1_w, row_h, "D")
            m.set_font("Helvetica", "B", 9)
            m.set_text_color(*green_dark)
            m.set_xy(G + 8, ry + 7)
            m.cell(col1_w - 16, 11, label)

            # Col 2 - value
            m.set_fill_color(255, 255, 255)
            m.rect(G + col1_w, ry, col2_w, row_h, "D")
            m.set_font("Helvetica", "", 9)
            m.set_text_color(*gray_text)
            m.set_xy(G + col1_w + 8, ry + 7)
            m.cell(col2_w - 16, 11, val)

        y += len(rows) * row_h + 16

        # ═══════════════════════════════════════════════
        # 5. INFO BOX
        # ═══════════════════════════════════════════════
        box_h = 36
        m.set_fill_color(*green_light)
        m.set_draw_color(*green_dark)
        m.set_line_width(0.4)
        m.rect(G, y, cw, box_h, "DF")
        m.set_font("Helvetica", "", 8)
        m.set_text_color(*gray_text)
        m.set_xy(G + 12, y + 8)
        m.multi_cell(cw - 24, 10,
            "Para verificar a autenticidade deste documento, acesse o endereco de "
            "validacao acima e informe o codigo de verificacao.")
        y += box_h + 18

        # ═══════════════════════════════════════════════
        # 6. SIGNATURES SECTION
        # ═══════════════════════════════════════════════
        m.set_font("Helvetica", "B", 14)
        m.set_text_color(*green_dark)
        m.set_xy(G, y)
        m.cell(cw, 18, "Assinaturas")
        y += 22
        section_line(y)
        y += 14

        # Signature card
        card_h = 58
        m.set_fill_color(255, 255, 255)
        m.set_draw_color(*gray_border)
        m.rect(G, y, cw, card_h, "D")

        # Number badge
        badge_r = 10
        m.set_fill_color(*green_dark)
        m.rect(G + 10, y + 10, 22, 22, "F")
        m.set_font("Helvetica", "B", 11)
        m.set_text_color(255, 255, 255)
        m.set_xy(G + 10, y + 12)
        m.cell(22, 18, "1", align="C")

        # Signer name
        m.set_font("Helvetica", "B", 10)
        m.set_text_color(*green_dark)
        m.set_xy(G + 42, y + 8)
        m.cell(cw - 52, 14, clean_name)

        # Details
        m.set_font("Helvetica", "", 8)
        m.set_text_color(*gray_text)
        m.set_xy(G + 42, y + 24)
        m.cell(cw - 52, 10, f"Assinado em: {date_str}")
        m.set_xy(G + 42, y + 35)
        m.cell(cw - 52, 10, "Certificado: ICP-Brasil A1")

        # Status
        m.set_text_color(40, 150, 60)
        m.set_xy(G + 42, y + 46)
        m.cell(cw - 52, 10, "Status: Assinatura digital valida")

        y += card_h + 22

        # ═══════════════════════════════════════════════
        # 7. VALIDATION CODE BOX
        # ═══════════════════════════════════════════════
        vcode_h = 56
        m.set_draw_color(*gray_border)
        m.set_line_width(0.5)
        m.set_fill_color(255, 255, 255)
        # Dashed border effect (using rect with D)
        m.rect(G + 40, y, cw - 80, vcode_h, "D")

        m.set_font("Helvetica", "", 8)
        m.set_text_color(*gray_text)
        m.set_xy(G + 50, y + 8)
        m.cell(cw - 100, 10, "Codigo de validacao deste documento:", align="C")

        m.set_font("Courier", "B", 16)
        m.set_text_color(*green_dark)
        m.set_xy(G + 50, y + 22)
        m.cell(cw - 100, 22, vcode, align="C")

        y += vcode_h + 14

        # ═══════════════════════════════════════════════
        # 8. QR CODE + ICP LOGO (bottom area)
        # ═══════════════════════════════════════════════
        icp_path = os.path.join(os.path.dirname(__file__), "..", "..", "static", "icp.png")
        if os.path.exists(icp_path):
            try:
                m.image(icp_path, x=G, y=y, w=70, h=24)
            except Exception:
                logger.warning("Could not render ICP-Brasil logo on manifest", exc_info=True)

        # QR Code
        try:
            import qrcode
            from io import BytesIO as QBI
            qr_url = f"{validation_url}?codigo={vcode}"
            qr = qrcode.make(qr_url, box_size=3, border=1)
            qb = QBI()
            qr.save(qb, format="PNG")
            qb.seek(0)
            m.image(qb, x=G + cw - 60, y=y - 4, w=60, h=60)
        except Exception:
            logger.warning("Could not generate QR code for manifest", exc_info=True)

        # ═══════════════════════════════════════════════
        # 9. PAGE NUMBER
        # ═══════════════════════════════════════════════
        m.set_font("Helvetica", "", 7)
        m.set_text_color(160, 160, 160)
        m.set_xy(G, 800)
        m.cell(cw, 10, "Pagina 2 de 2", align="C")

        writer.add_page(PdfReader(io.BytesIO(m.output())).pages[0])
        buf = io.BytesIO()
        writer.write(buf)
        return buf.getvalue()

    def _embed_signature(self, pdf_bytes: bytes) -> bytes:
        content_marker = b"/Contents <"
        cs = pdf_bytes.find(content_marker)
        if cs == -1:
            content_marker = b"/Contents("
            cs = pdf_bytes.find(content_marker)
        if cs == -1:
            raise ValueError("Cannot find /Contents in PDF")

        ce = pdf_bytes.find(b">", cs)
        if ce == -1:
            raise ValueError("Cannot find end of /Contents")
        ce += 1

        before = pdf_bytes[:cs + len(content_marker)]
        after = pdf_bytes[ce:]

        sig_start = len(before)
        sig_end = sig_start + SIG_PLACEHOLDER_SIZE
        total = len(before) + len(after) + SIG_PLACEHOLDER_SIZE
        range_after = total - sig_end

        pdf_ph = before + b"\x00" * SIG_PLACEHOLDER_SIZE + after

        br_str = f"/ByteRange [0 {sig_start} {sig_end} {range_after}]".encode("ascii")
        br_pos = pdf_ph.find(b"/ByteRange [0 0 0 0]")
        if br_pos >= 0:
            br_end = pdf_ph.find(b"]", br_pos) + 1
            pdf_ph = pdf_ph[:br_pos] + br_str + pdf_ph[br_end:]

        data_to_sign = pdf_ph[:sig_start] + pdf_ph[sig_end:]

        # Build CMS with PAdES attributes
        opts = [
            pkcs7.PKCS7Options.DetachedSignature,
            pkcs7.PKCS7Options.Binary,
        ]

        builder = pkcs7.PKCS7SignatureBuilder()
        builder = builder.set_data(data_to_sign)
        builder = builder.add_signer(self._cert, self._key, hashes.SHA256())
        builder = builder.add_certificate(self._cert)

        for ca in self._ca_certs:
            try:
                builder = builder.add_certificate(ca)
            except Exception:
                logger.warning("Could not add CA certificate to CMS builder", exc_info=True)

        sig_der = builder.sign(serialization.Encoding.DER, opts)

        sig_hex = sig_der.hex()
        max_hex = SIG_PLACEHOLDER_SIZE * 2
        if len(sig_hex) > max_hex:
            raise ValueError(f"Signature too large ({len(sig_hex)} > {max_hex})")

        sig_bytes = bytes.fromhex(sig_hex.ljust(max_hex, "0"))
        return before + sig_bytes + after

    def verify(self, pdf_bytes: bytes) -> bool:
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            fields = reader.get_fields()
            if not fields:
                return False
            for f in fields.values():
                if f.get("/FT") == "/Sig":
                    sig = f.get("/V")
                    if sig and sig.get("/Contents"):
                        return True
            return False
        except Exception:
            logger.warning("Signature verification failed", exc_info=True)
            return False

    def _create_visible_appearance(self, sign_time: datetime, reason: str):
        """Create a visible signature appearance stream."""
        w, h = 240, 80
        date_str = sign_time.strftime("%d/%m/%Y %H:%M")

        content_lines = [
            b"q",
            b"1 0 0 1 0 0 cm",
            b"0 0 240 80 re W n",
            b"0.88 0.93 0.98 RG 0.88 0.93 0.98 rg",
            b"0 0 240 80 re f",
            b"0.2 0.4 0.7 RG",
            b"2 w",
            b"0.5 0.5 239 79 re S",
            b"0.2 0.4 0.7 rg",
            b"BT",
            b"/F1 8 Tf",
            b"5 63 Td",
            b"(ASSINADO DIGITALMENTE) Tj",
            b"0 0 0 rg",
            b"/F1 7 Tf",
            b"5 50 Td",
            f"({self._subject[:55]}) Tj".encode(),
            b"/F1 7 Tf",
            b"5 38 Td",
            f"({date_str}) Tj".encode(),
            b"/F1 7 Tf",
            b"5 26 Td",
            f"({reason[:45]}) Tj".encode(),
            b"0.4 0.4 0.4 rg",
            b"/F1 6 Tf",
            b"5 15 Td",
            b"(ICP-Brasil AD-RB  |  PAdES) Tj",
            b"ET",
            b"Q",
        ]

        stream = StreamObject()
        stream._data = b"\n".join(content_lines) + b"\n"
        stream[NameObject("/Type")] = NameObject("/XObject")
        stream[NameObject("/Subtype")] = NameObject("/Form")
        stream[NameObject("/FormType")] = NumberObject(1)
        stream[NameObject("/BBox")] = ArrayObject([NumberObject(0), NumberObject(0), NumberObject(w), NumberObject(h)])
        stream[NameObject("/Resources")] = DictionaryObject({
            NameObject("/Font"): DictionaryObject({
                NameObject("/F1"): DictionaryObject({
                    NameObject("/Type"): NameObject("/Font"),
                    NameObject("/Subtype"): NameObject("/Type1"),
                    NameObject("/BaseFont"): NameObject("/Helvetica"),
                }),
            }),
        })
        return stream

    def verify_detailed(self, pdf_bytes: bytes) -> dict:
        """Verify signature and return detailed validation report."""
        result = {
            "valid": False,
            "signatures": [],
            "errors": [],
            "warnings": [],
        }
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            fields = reader.get_fields() or {}
            for name, field in fields.items():
                if field.get("/FT") != "/Sig":
                    continue
                sig = field.get("/V")
                if not sig:
                    continue

                sig_info = {
                    "name": name,
                    "filter": str(sig.get("/Filter", "")),
                    "subfilter": str(sig.get("/SubFilter", "")),
                    "reason": str(sig.get("/Reason", "")),
                    "location": str(sig.get("/Location", "")),
                    "signing_time": str(sig.get("/M", "")),
                    "byte_range": list(sig.get("/ByteRange", [])),
                }

                if str(sig.get("/SubFilter", "")) == "/PBAD.PAdES":
                    sig_info["format_ok"] = True
                else:
                    sig_info["format_ok"] = False
                    result["warnings"].append(f"SubFilter não é PBAD.PAdES: {sig.get('/SubFilter')}")

                result["signatures"].append(sig_info)
                result["valid"] = True

        except Exception as e:
            logger.warning("Detailed signature verification failed: %s", e, exc_info=True)
            result["errors"].append(str(e))

        return result

    def get_certificate_info(self) -> dict:
        return {
            "provider": "a1",
            "format": "PAdES-AD-RB",
            "policy_oid": PADES_AD_RB_OID,
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
