"""Convert uploaded PDF pages to images for embedding in matter content."""

import os
import io
from pathlib import Path

from pdf2image import convert_from_bytes

from app.core.config import settings


def pdf_to_content_html(pdf_bytes: bytes, matter_id: str) -> str:
    """Convert PDF pages to JPEG images, one page at a time to save memory.

    Processes pages individually — important for 30+ page reports.
    JPEG at 120 DPI / 85% quality keeps files small (~150KB/page).
    """
    content_dir = Path(settings.UPLOAD_DIR).resolve() / "matter-content" / matter_id
    os.makedirs(str(content_dir), exist_ok=True)

    html_parts: list[str] = []
    page_num = 1
    # Process one page at a time to avoid loading 30+ pages in memory
    while True:
        try:
            images = convert_from_bytes(pdf_bytes, dpi=120, first_page=page_num, last_page=page_num)
        except Exception:
            break
        if not images:
            break
        img = images[0]
        filename = f"page_{page_num:03d}.jpg"
        filepath = content_dir / filename
        img.save(str(filepath), "JPEG", quality=85)
        url = f"http://api:8000/api/v1/matter-content/{matter_id}/{filename}"
        html_parts.append(
            f'<p style="text-align:center;margin:0;page-break-inside:avoid;">'
            f'<img src="{url}" alt="Página {page_num}" '
            f'style="max-width:100%;height:auto;" />'
            f'</p>'
        )
        page_num += 1
        if page_num > 100:  # safety limit
            break

    return "\n".join(html_parts)
