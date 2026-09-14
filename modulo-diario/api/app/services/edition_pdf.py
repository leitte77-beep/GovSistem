"""PDF generation for editions - single source of truth."""

import base64
import io
import os
import re
import uuid
from pathlib import Path
from urllib.parse import unquote, urlsplit

from jinja2 import Environment, FileSystemLoader
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_sync_db
from app.document_model.body_html import DOCUMENT_BODY_CSS
from app.models.enums import EditionStatus
from app.semantic.snapshot import verify_snapshot
from app.services.pdf_utils import compute_hash, format_date

TEMPLATE_DIR = Path(__file__).parent.parent / "templates" / "pdf"
LAYOUTS_DIR = TEMPLATE_DIR / "layouts"
OUTPUT_DIR = Path(settings.UPLOAD_DIR)
AVAILABLE_LAYOUTS = ["classico", "moderno", "minimalista"]
WEEKDAYS_PT = [
    "SEGUNDA-FEIRA", "TERCA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA",
    "SEXTA-FEIRA", "SABADO", "DOMINGO",
]
MONTHS_PT_UPPER = [
    "JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO",
    "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
]
MATTER_IMAGE_URL_RE = re.compile(
    r'<img\s+src="https?://[^"/]+(?:/[^"/]*)*/matter-content/'
    r'([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})/'
    r'(page_[0-9]+\.(?:png|jpg|jpeg))"'
)


def _path_is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _check_allowed_url(url: str) -> None:
    """Allow embedded data and trusted local PDF assets; deny network fetches."""
    parsed = urlsplit(url)
    if parsed.scheme == "data":
        return
    if parsed.scheme != "file":
        raise ValueError(f"External resource blocked while rendering PDF: {parsed.scheme}")

    requested = Path(unquote(parsed.path)).resolve()
    allowed_roots = (
        TEMPLATE_DIR.resolve(),
        (Path(settings.UPLOAD_DIR).resolve() / "matter-content").resolve(),
    )
    if not any(_path_is_within(requested, root) for root in allowed_roots):
        raise ValueError("Local resource outside trusted PDF directories")


try:  # WeasyPrint >= 68 exposes the URLFetcher class (default_url_fetcher removed in 70).
    from weasyprint.urls import URLFetcher as _WeasyPrintURLFetcher
except ImportError:  # pragma: no cover - older WeasyPrint (< 68)
    _WeasyPrintURLFetcher = None


if _WeasyPrintURLFetcher is not None:

    class _RestrictedURLFetcher(_WeasyPrintURLFetcher):
        """Restrict WeasyPrint resource loading to trusted local assets."""

        def fetch(self, url, headers=None):
            _check_allowed_url(url)
            return super().fetch(url, headers=headers)

    _restricted_url_fetcher = _RestrictedURLFetcher()

else:  # pragma: no cover - older WeasyPrint (< 68) used a plain callable.

    def _restricted_url_fetcher(url):  # type: ignore[misc]
        from weasyprint import default_url_fetcher  # type: ignore[attr-defined]

        _check_allowed_url(url)
        return default_url_fetcher(url)


def _localize_matter_images(content_html: str) -> str:
    root = (Path(settings.UPLOAD_DIR).resolve() / "matter-content").resolve()

    def replace(match: re.Match[str]) -> str:
        image_path = (root / match.group(1) / match.group(2)).resolve()
        if not _path_is_within(image_path, root):
            raise ValueError("Matter image resolved outside trusted storage")
        return f'<img src="{image_path.as_uri()}"'

    return MATTER_IMAGE_URL_RE.sub(replace, content_html)


def _normalize_for_summary(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip().casefold()


def _summary_metadata(title: str, act_type: str, org_unit: str, section_title: str | None) -> str:
    title_normalized = _normalize_for_summary(title)
    metadata_parts = []

    for item in [act_type, org_unit, section_title or ""]:
        item = (item or "").strip()
        if not item:
            continue

        if item == act_type and title_normalized.startswith(_normalize_for_summary(item)):
            continue

        metadata_parts.append(item)

    return " • ".join(metadata_parts)


def _render_semantic_content(item: dict) -> str | None:
    """Render a frozen semantic document with the SAME renderer used publicly.

    When a snapshot item carries a canonical ``semantic`` document, the PDF must
    derive from it — not from a separately stored ``content_html`` — so the
    official PDF and the public HTML can never diverge. Returns ``None`` when
    there is no semantic document (legacy matters fall back to ``content_html``).
    """
    semantic = item.get("semantic")
    if not semantic:
        return None
    try:
        from app.semantic.renderer import render_document
        from app.semantic.schemas import SemanticDocument
        from app.semantic.templates import default_config_for

        doc = SemanticDocument.model_validate(semantic)
        try:
            config = default_config_for(doc.document_type or "outros")
        except Exception:  # noqa: BLE001 - unknown type: render with defaults
            config = None
        return render_document(
            doc,
            config,
            media="print",
            include_style=True,
            include_page_rules=False,
        )
    except Exception:  # noqa: BLE001 - never fail the edition on render
        return None


def _save_to_storage(
    filename: str, content: bytes, tenant_slug: str | None = None
) -> str:
    """Persist the unsigned PDF, tenant-isolated when configured.

    ``read_public_file`` resolves ``base/{tenant}/pdf/{filename}``, so writing
    there keeps the download working while preventing cross-tenant reads of the
    raw (pre-signature) file.
    """
    target_dir = OUTPUT_DIR
    if settings.STORAGE_TENANT_ISOLATION and tenant_slug:
        target_dir = OUTPUT_DIR / tenant_slug / "pdf"
    os.makedirs(str(target_dir), exist_ok=True)
    path = str(target_dir / filename)
    with open(path, "wb") as f:
        f.write(content)
    return filename


def _qr_data_uri(url: str) -> str:
    """Generate the verification QR locally; no citizen data reaches a third party."""
    import qrcode

    image = qrcode.make(url)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def generate_edition_pdf_sync(
    edition_id: str,
    organ_name: str | None = None,
    verification_base_url: str | None = None,
    layout: str = "classico",
) -> dict:
    if not verification_base_url:
        verification_base_url = settings.VERIFICATION_BASE_URL

    db = get_sync_db()

    if layout not in AVAILABLE_LAYOUTS:
        layout = "classico"

    template_dir = LAYOUTS_DIR / layout
    if not template_dir.exists():
        template_dir = LAYOUTS_DIR / "classico"
    try:
        from app.models.edition import Edition
        from app.models.edition_item import EditionItem
        from app.models.edition_publication_snapshot import EditionPublicationSnapshot

        result = db.execute(
            select(Edition)
            .where(Edition.id == uuid.UUID(edition_id))
            .options(
                selectinload(Edition.items).selectinload(EditionItem.matter),
                selectinload(Edition.organization),
            )
        )
        edition = result.scalar_one_or_none()
        if edition is None:
            raise ValueError(f"Edition {edition_id} not found")

        if organ_name is None:
            organ_name = edition.organization.name

        if not edition.verification_code:
            edition.generate_verification_code()

        verification_code = edition.verification_code
        db.commit()

        snapshot = db.execute(
            select(EditionPublicationSnapshot)
            .where(
                EditionPublicationSnapshot.edition_id == edition.id,
                EditionPublicationSnapshot.is_valid.is_(True),
            )
            .order_by(EditionPublicationSnapshot.frozen_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        if snapshot is None:
            raise ValueError("Canonical publication snapshot is required before PDF generation")
        snapshot_ok, snapshot_reason = verify_snapshot(snapshot.content)
        if not snapshot_ok:
            raise ValueError(f"Invalid canonical publication snapshot: {snapshot_reason}")
        verified_manifest_hash = snapshot.content["content_manifest_hash"]
        if (
            snapshot.content_manifest_hash
            and snapshot.content_manifest_hash != verified_manifest_hash
        ):
            raise ValueError("Snapshot manifest hash column differs from verified content")

        sections_map: dict[str, list] = {}

        for item in sorted(snapshot.content.get("items", []), key=lambda i: i["position"]):
            section_key = item.get("section_title") or "Geral"
            if section_key not in sections_map:
                sections_map[section_key] = []
            # Prefer the canonical semantic document (same source as the public
            # page). Fall back to the frozen legacy HTML only for old matters.
            semantic_html = _render_semantic_content(item)
            if semantic_html is not None:
                content_html = semantic_html
            else:
                content_html = item.get("content_html") or ""
            # Convert HTTP image URLs to local file:// URIs for weasyprint
            content_html = _localize_matter_images(content_html)
            sections_map[section_key].append({
                "id": item["id"],
                "title": item.get("title") or "Matéria",
                "summary": item.get("summary"),
                "content_html": content_html,
                "act_type": (item.get("metadata") or {}).get("act_type_name", ""),
                "org_unit": (item.get("metadata") or {}).get("org_unit_name", ""),
                "author": (item.get("responsible") or {}).get("name", ""),
                "is_pdf_image_content": (
                    "matter-content" in content_html and "<img" in content_html.lower()
                ),
            })

        sections = [
            {"title": key if key != "Geral" else None, "matters": matters}
            for key, matters in sections_map.items()
        ]
        summary_items = []
        for section in sections:
            for matter in section["matters"]:
                summary_items.append({
                    "id": matter["id"],
                    "anchor": f"matter-{matter['id']}",
                    "title": matter["title"],
                    "section_title": section["title"],
                    "metadata": _summary_metadata(
                        matter["title"],
                        matter["act_type"],
                        matter["org_unit"],
                        section["title"],
                    ),
                    "position": len(summary_items) + 1,
                })

        type_labels = {"normal": "Normal", "extra": "Extra", "suplementar": "Suplementar"}

        env = Environment(loader=FileSystemLoader(str(template_dir)))
        template = env.get_template("edition.html")

        css_path = str(template_dir / "edition.css")

        def _render_html(total_pages: str = "") -> str:
            verification_target = f"{verification_base_url.rstrip('/')}/{verification_code}"
            return template.render(
                organ_name=organ_name,
                edition=edition,
                edition_type_label=type_labels.get(edition.type, "Normal"),
                publication_date=format_date(edition.publication_date),
                header_date=(
                    f"{WEEKDAYS_PT[edition.publication_date.weekday()]}, "
                    f"{edition.publication_date.day:02d} DE "
                    f"{MONTHS_PT_UPPER[edition.publication_date.month - 1]} DE "
                    f"{edition.publication_date.year}"
                ),
                edition_year_label=f"ANO: {edition.year}",
                logo_path=(template_dir / "brasao.png").as_uri(),
                verification_code=verification_code,
                is_preliminary=False,
                verification_url=verification_base_url,
                summary_items=summary_items,
                sections=sections,
                css_path=css_path,
                extra_css=DOCUMENT_BODY_CSS,
                total_pages=total_pages,
                total_matters=len(summary_items),
                qr_code_uri=_qr_data_uri(verification_target),
                # Stable SHA-256 of the canonical publication content. This is
                # distinct from the final PDF hash protected by PAdES.
                content_manifest_hash=verified_manifest_hash,
            )

        from weasyprint import CSS, HTML  # noqa: N811

        # First pass — render without total page count
        html_first = _render_html()
        pdf_bytes = HTML(
            string=html_first,
            base_url=str(template_dir),
            url_fetcher=_restricted_url_fetcher,
        ).write_pdf(stylesheets=[CSS(filename=css_path)])

        # Count total pages from the rendered PDF
        total_pages = str(len(PdfReader(io.BytesIO(pdf_bytes)).pages))

        # Second pass — re-render with the actual page count
        html_final = _render_html(total_pages=total_pages)
        pdf_bytes = HTML(
            string=html_final,
            base_url=str(template_dir),
            url_fetcher=_restricted_url_fetcher,
        ).write_pdf(stylesheets=[CSS(filename=css_path)])

        # A page-count label can itself affect pagination. Converge once more
        # and fail rather than publishing a PDF with an incorrect total.
        final_page_count = len(PdfReader(io.BytesIO(pdf_bytes)).pages)
        if final_page_count != int(total_pages):
            total_pages = str(final_page_count)
            pdf_bytes = HTML(
                string=_render_html(total_pages=total_pages),
                base_url=str(template_dir),
                url_fetcher=_restricted_url_fetcher,
            ).write_pdf(stylesheets=[CSS(filename=css_path)])
            if len(PdfReader(io.BytesIO(pdf_bytes)).pages) != int(total_pages):
                raise ValueError("PDF pagination did not converge")

        pdf_hash = compute_hash(pdf_bytes)
        filename = f"edition_{edition.year}_{edition.number}_{uuid.uuid4().hex[:8]}.pdf"
        tenant_slug = getattr(edition.organization, "slug", None)
        _save_to_storage(filename, pdf_bytes, tenant_slug=tenant_slug)

        edition.pdf_path = filename
        edition.pdf_hash = pdf_hash
        edition.source_pdf_hash = pdf_hash
        edition.content_manifest_hash = verified_manifest_hash
        edition.verification_code = verification_code
        edition.status = EditionStatus.PDF_GENERATED
        db.commit()

        return {
            "edition_id": edition_id,
            "filename": filename,
            "sha256": pdf_hash,
            "size_bytes": len(pdf_bytes),
            "verification_code": verification_code,
        }
    finally:
        db.close()
