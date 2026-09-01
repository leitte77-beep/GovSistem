"""Auditoria SOMENTE-LEITURA das edições SIGNED/PUBLISHED.

Examina o armazenamento e o banco e produz um relatório por edição:
- caminho do arquivo, hash armazenado vs hash real
- presença de /Sig, validade criptográfica
- divergência entre status do banco e assinatura real

NÃO altera, NÃO substitui e NÃO reassina documentos. Uso:
    python -m app.commands.audit_editions
"""
import argparse
import hashlib
import io
import json
import os
import sys

from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_sync_db
from app.models.edition import Edition
from app.models.enums import EditionStatus


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _resolve_local_path(file_path: str) -> str:
    # tolerant: root, farol/, farol/pdf/
    base = settings.UPLOAD_DIR
    for candidate in (os.path.join(base, file_path),
                      os.path.join(base, "pdf", file_path),
                      os.path.join(base, "farol", file_path),
                      os.path.join(base, "farol", "pdf", file_path)):
        if os.path.exists(candidate):
            return candidate
    return ""


def _has_real_sig_and_valid(bytes_pdf: bytes) -> tuple[bool, bool, str]:
    """Return (has_sig, cryptographically_ok, summary).

    Presence of /Sig is detected via pypdf. Cryptographic validation uses
    pyHanko when available; otherwise it reports the dependency as pending
    (this keeps the audit read-only and runnable in any container).
    """
    has_sig = False
    try:
        from pypdf import PdfReader
        fields = PdfReader(io.BytesIO(bytes_pdf)).get_fields() or {}
        has_sig = any(f.get("/FT") == "/Sig" for f in fields.values())
    except Exception:  # noqa: BLE001
        pass

    try:
        from pyhanko.pdf_utils.reader import PdfFileReader as HkReader
        from pyhanko.sign.validation import validate_pdf_signature
        from pyhanko_certvalidator import ValidationContext

        reader = HkReader(io.BytesIO(bytes_pdf))
        emb = list(reader.embedded_signatures)
        if not emb:
            return has_sig, False, "sem assinatura"
        results = []
        vc = ValidationContext(trust_roots=[])  # determinístico; raízes ICP via infra se configurado
        for e in emb:
            status = validate_pdf_signature(e, vc)
            results.append((bool(status.intact), bool(status.valid)))
        ok = all(i and v for i, v in results)
        return has_sig, ok, json.dumps(results)
    except ModuleNotFoundError:
        return has_sig, None, "validacao criptografica indisponivel (pyhanko ausente)"
    except Exception as exc:  # noqa: BLE001
        return has_sig, False, f"erro validacao: {exc}"


def audit(org_slug: str | None = None, only_statuses=None) -> dict:
    db = get_sync_db()
    statuses = only_statuses or [EditionStatus.SIGNED, EditionStatus.PUBLISHED]
    try:
        q = select(Edition).where(Edition.status.in_(statuses))
        if org_slug:
            from app.models.organization import Organization
            q = q.join(Organization).where(Organization.slug == org_slug)
        editions = db.execute(q).scalars().all()

        report = []
        for ed in editions:
            entry = {
                "edition_id": str(ed.id),
                "year": ed.year,
                "number": ed.number,
                "status_db": ed.status.value if hasattr(ed.status, "value") else str(ed.status),
                "signed_pdf_path": ed.signed_pdf_path,
                "pdf_path": ed.pdf_path,
                "stored_pdf_hash": ed.signed_pdf_hash or ed.pdf_hash,
                "source_pdf_hash": ed.source_pdf_hash,
                "file_present": False,
                "real_hash": None,
                "has_sig": False,
                "sig_crypto_ok": None,
                "sig_summary": None,
                "divergence": [],
            }

            # try signed path first, then unsigned
            path = ""
            for p in (ed.signed_pdf_path, ed.pdf_path):
                if not p:
                    continue
                path = _resolve_local_path(p)
                if path:
                    break
            if not path:
                entry["divergence"].append("arquivo nao encontrado no storage local")
                report.append(entry)
                continue

            entry["file_present"] = True
            entry["file_path"] = path
            with open(path, "rb") as fh:
                data = fh.read()
            entry["real_hash"] = _sha256(data)
            entry["has_sig"], entry["sig_crypto_ok"], entry["sig_summary"] = _has_real_sig_and_valid(data)

            if entry["stored_pdf_hash"] and entry["stored_pdf_hash"] != entry["real_hash"]:
                entry["divergence"].append("hash armazenado difere do hash real do arquivo")
            if entry["status_db"] in ("published", "signed") and not entry["has_sig"]:
                entry["divergence"].append("status marcado como assinado/publicado sem /Sig")
            elif entry["has_sig"] and entry["sig_crypto_ok"] is False:
                entry["divergence"].append("assinatura presente mas validacao criptografica falhou")

            report.append(entry)
        return {"count": len(report), "editions": report}
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Auditoria somente-leitura de edições assinadas/publicadas")
    ap.add_argument("--org", default=None, help="slug da organização (ex: farol)")
    ap.add_argument("--json", action="store_true", help="saída JSON")
    args = ap.parse_args()

    result = audit(org_slug=args.org)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    print(f"Total de edições auditadas: {result['count']}")
    for e in result["editions"]:
        flags = e["divergence"] if e["divergence"] else ["OK"]
        print(f"  {e['year']}/{e['number']} [{e['status_db']}] sig={e['has_sig']} ok={e['sig_crypto_ok']} "
              f"presente={e['file_present']} -> {', '.join(flags)}")


if __name__ == "__main__":
    main()
