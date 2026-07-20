"""PDF generation for editions - single source of truth."""

import fcntl
import io
import os
import re
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from jinja2 import Environment, FileSystemLoader
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_sync_db
from app.models.enums import EditionStatus
from app.services.pdf_utils import compute_hash, detect_landscape, format_date

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
PDF_RENDER_LOCK_PATH = Path("/tmp/doe-edition-pdf-render.lock")
PDF_RENDER_LOCK_TIMEOUT_SECONDS = 10 * 60


@contextmanager
def edition_pdf_render_lock(
    lock_path: str | os.PathLike[str] = PDF_RENDER_LOCK_PATH,
    *,
    timeout_seconds: float | None = PDF_RENDER_LOCK_TIMEOUT_SECONDS,
) -> Iterator[None]:
    """Serialize the memory-heavy WeasyPrint passes across Gunicorn workers."""
    lock_fd = os.open(os.fspath(lock_path), os.O_CREAT | os.O_RDWR, 0o600)
    acquired = False
    deadline = None if timeout_seconds is None else time.monotonic() + timeout_seconds

    try:
        while True:
            try:
                fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                acquired = True
                break
            except BlockingIOError:
                if deadline is not None:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise TimeoutError(
                            f"Timed out waiting for PDF render lock after {timeout_seconds}s"
                        )
                    time.sleep(min(0.05, remaining))
                else:
                    time.sleep(0.05)

        yield
    finally:
        if acquired:
            fcntl.flock(lock_fd, fcntl.LOCK_UN)
        os.close(lock_fd)


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


def _save_to_storage(filename: str, content: bytes) -> str:
    os.makedirs(str(OUTPUT_DIR), exist_ok=True)
    path = str(OUTPUT_DIR / filename)
    with open(path, "wb") as f:
        f.write(content)
    return filename


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

        sections_map: dict[str, list] = {}
        for item in sorted(edition.items or [], key=lambda i: i.position):
            section_key = item.section_title or "Geral"
            if section_key not in sections_map:
                sections_map[section_key] = []
            matter = item.matter
            content_html = matter.content_html if matter else ""
            # Convert HTTP image URLs to local file:// URIs for weasyprint
            content_html = re.sub(
                r'<img\s+src="https?://[^"]+/matter-content/([^/]+)/(page_\d+\.(?:png|jpg|jpeg))"',
                lambda m: f'<img src="{(Path(settings.UPLOAD_DIR).resolve() / "matter-content" / m.group(1) / m.group(2)).as_uri()}"',
                content_html,
            )
            sections_map[section_key].append({
                "id": str(item.id),
                "title": matter.title if matter else "Matéria",
                "summary": matter.summary if matter else None,
                "content_html": content_html,
                "act_type": matter.act_type.name if matter and matter.act_type else "",
                "org_unit": matter.org_unit.abbreviation if matter and matter.org_unit else "",
                "author": matter.author.name if matter and matter.author else "",
                "is_landscape": detect_landscape(content_html),
                "is_pdf_image_content": "matter-content" in content_html and "<img" in content_html.lower(),
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
                total_pages=total_pages,
            )

        from weasyprint import CSS, HTML  # noqa: N811

        # Keep both passes atomic relative to other Gunicorn processes: each
        # render can consume hundreds of MB while WeasyPrint lays out images.
        with edition_pdf_render_lock():
            # First pass — render without total page count
            html_first = _render_html()
            pdf_bytes = HTML(
                string=html_first,
                base_url=str(template_dir),
            ).write_pdf(stylesheets=[CSS(filename=css_path)])

            # Count total pages from the rendered PDF
            total_pages = str(len(PdfReader(io.BytesIO(pdf_bytes)).pages))

            # Second pass — re-render with the actual page count
            html_final = _render_html(total_pages=total_pages)
            pdf_bytes = HTML(
                string=html_final,
                base_url=str(template_dir),
            ).write_pdf(stylesheets=[CSS(filename=css_path)])

        pdf_hash = compute_hash(pdf_bytes)
        filename = f"edition_{edition.year}_{edition.number}_{uuid.uuid4().hex[:8]}.pdf"
        _save_to_storage(filename, pdf_bytes)

        edition.pdf_path = filename
        edition.pdf_hash = pdf_hash
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
