"""Post-render inspection of the official edition PDF.

Generating the PDF is not the end of the job. After WeasyPrint produces the
bytes we re-open the file and verify that what we promised actually exists in
the output: every matter must have an anchor (and therefore a real page number),
the page size must be consistent, fonts must be embedded, and the signature
state must match the stage we are in.

Official editions fail closed on errors (``MISSING_MATTER_ANCHOR``); previews
and reports can run the same inspector in a non-blocking way.
"""

from __future__ import annotations

import io
import logging
from typing import Iterable, Optional

from pypdf import PdfReader

logger = logging.getLogger(__name__)

SEVERITY_ERROR = "error"
SEVERITY_WARNING = "warning"

_ANCHOR_PREFIX = "matter-"


def _anchor_page_numbers(reader: PdfReader) -> dict[str, int]:
    pages: dict[str, int] = {}
    try:
        destinations = reader.named_destinations or {}
    except Exception:  # noqa: BLE001
        return pages
    for name, dest in destinations.items():
        try:
            index = reader.get_destination_page_number(dest)
        except Exception:  # noqa: BLE001 - a broken dest must not fail inspection
            continue
        if index is not None and index >= 0:
            pages[str(name)] = index + 1
    return pages


def _font_is_embedded(font) -> bool:
    descriptor = font.get("/FontDescriptor")
    if descriptor is not None:
        d = descriptor.get_object()
        if any(key in d for key in ("/FontFile", "/FontFile2", "/FontFile3")):
            return True
    descendants = font.get("/DescendantFonts")
    if descendants is not None:
        try:
            for ref in descendants:
                dfont = ref.get_object()
                ddesc = dfont.get("/FontDescriptor")
                if ddesc is None:
                    continue
                d = ddesc.get_object()
                if any(key in d for key in ("/FontFile", "/FontFile2", "/FontFile3")):
                    return True
        except Exception:  # noqa: BLE001
            return False
    return False


def _collect_fonts(reader: PdfReader) -> dict[str, bool]:
    """Map BaseFont name -> embedded (True only if every occurrence is)."""
    fonts: dict[str, bool] = {}
    for page in reader.pages:
        try:
            resources = page.get("/Resources")
            if resources is None:
                continue
            resources = resources.get_object()
            font_dict = resources.get("/Font")
            if font_dict is None:
                continue
            for _key, ref in font_dict.get_object().items():
                font = ref.get_object()
                name = str(font.get("/BaseFont", "?"))
                embedded = _font_is_embedded(font)
                fonts[name] = fonts.get(name, True) and embedded
        except Exception:  # noqa: BLE001
            continue
    return fonts


def _count_signatures(reader: PdfReader) -> int:
    try:
        fields = reader.get_fields() or {}
    except Exception:  # noqa: BLE001
        return 0
    count = 0
    for field in fields.values():
        try:
            if field.get("/FT") == "/Sig":
                count += 1
        except Exception:  # noqa: BLE001
            continue
    return count


def _pages_without_content(reader: PdfReader) -> list[int]:
    empty: list[int] = []
    for index, page in enumerate(reader.pages, start=1):
        try:
            if page.get("/Contents") is None:
                empty.append(index)
        except Exception:  # noqa: BLE001
            continue
    return empty


def inspect_edition_pdf(
    pdf_bytes: bytes,
    *,
    expected_matter_ids: Optional[Iterable[str]] = None,
    expect_signature: bool = False,
) -> dict:
    """Inspect a rendered edition PDF and return a structured report.

    The report is JSON-serializable and is itself preserved as an immutable
    artifact by the caller.
    """
    errors: list[dict] = []
    warnings: list[dict] = []

    def err(code: str, message: str, **extra) -> None:
        errors.append({"code": code, "severity": SEVERITY_ERROR, "message": message, **extra})

    def warn(code: str, message: str, **extra) -> None:
        warnings.append({"code": code, "severity": SEVERITY_WARNING, "message": message, **extra})

    expected_ids = [str(m) for m in (expected_matter_ids or [])]

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        page_count = len(reader.pages)
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "errors": [{
                "code": "PDF_UNREADABLE",
                "severity": SEVERITY_ERROR,
                "message": f"PDF inválido ou corrompido: {exc}",
            }],
            "warnings": [],
            "page_count": 0,
            "page_sizes": [],
            "page_number_by_anchor": {},
            "missing_anchors": expected_ids,
            "unexpected_anchors": [],
            "fonts_not_embedded": [],
            "has_signature": False,
            "metadata": {},
        }

    anchors = _anchor_page_numbers(reader)

    # Page sizes must be consistent.
    sizes: set[tuple[float, float]] = set()
    for page in reader.pages:
        try:
            sizes.add((round(float(page.mediabox.width), 1), round(float(page.mediabox.height), 1)))
        except Exception:  # noqa: BLE001
            continue
    if len(sizes) > 1:
        warn("INCONSISTENT_PAGE_SIZE", f"Tamanhos de página divergentes: {sorted(sizes)}")

    # Metadata (title is set from <title> by WeasyPrint).
    metadata: dict = {}
    try:
        info = reader.metadata or {}
        metadata = {str(k): (str(v) if v is not None else None) for k, v in dict(info).items()}
    except Exception:  # noqa: BLE001
        metadata = {}
    if not metadata.get("/Title"):
        warn("MISSING_PDF_TITLE", "PDF sem título nos metadados.")

    # Signature state must match the stage.
    signature_count = _count_signatures(reader)
    if expect_signature and signature_count == 0:
        err(
            "MISSING_SIGNATURE",
            "PDF deveria estar assinado, mas nenhuma assinatura foi encontrada.",
        )
    elif not expect_signature and signature_count > 0:
        warn("UNEXPECTED_SIGNATURE", "PDF não assinado contém assinatura(s).")

    # Anchors: every expected matter must resolve to a page.
    expected_anchors = {f"{_ANCHOR_PREFIX}{matter_id}" for matter_id in expected_ids}
    found_anchors = set(anchors.keys())
    missing = sorted(expected_anchors - found_anchors)
    unexpected = sorted(
        a for a in (found_anchors - expected_anchors) if a.startswith(_ANCHOR_PREFIX)
    )
    page_number_by_anchor = {
        anchor: anchors[anchor] for anchor in expected_anchors if anchor in anchors
    }

    for anchor in missing:
        matter_id = anchor[len(_ANCHOR_PREFIX):]
        err(
            "MISSING_MATTER_ANCHOR",
            f"A matéria {matter_id} está no snapshot, mas não foi localizada no PDF.",
            matter_id=matter_id,
        )
    if unexpected:
        warn(
            "UNEXPECTED_MATTER_ANCHOR",
            f"Âncoras de matérias inesperadas no PDF: {unexpected[:10]}",
        )

    # Fonts must be embedded for a durable official document.
    fonts = _collect_fonts(reader)
    not_embedded = sorted(name for name, embedded in fonts.items() if not embedded)
    if not_embedded:
        warn("FONT_NOT_EMBEDDED", f"Fontes não incorporadas: {not_embedded}")

    # Unexpected blank pages.
    empty_pages = _pages_without_content(reader)
    if empty_pages:
        warn("EMPTY_PAGES", f"Páginas sem conteúdo: {empty_pages}")

    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "page_count": page_count,
        "page_sizes": sorted(f"{w}x{h}" for w, h in sizes),
        "page_number_by_anchor": page_number_by_anchor,
        "missing_anchors": missing,
        "unexpected_anchors": unexpected,
        "fonts_not_embedded": not_embedded,
        "has_signature": signature_count > 0,
        "signature_count": signature_count,
        "metadata": metadata,
    }
