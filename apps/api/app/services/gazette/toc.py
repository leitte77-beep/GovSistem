"""Geracao dos dados utilizados pelo sumario da edicao.

O numero da pagina nao e calculado aqui: ele vem do sistema de paginacao
existente (edition_pdf.py). Este modulo fornece categoria, titulo e ancora.
"""

import re
import unicodedata

from pydantic import BaseModel

from app.services.gazette.normalize import collapse_spaces
from app.services.gazette.types import ParsedDocument


class TocEntry(BaseModel):
    category: str | None = None
    document_title: str | None = None
    table_of_contents_title: str | None = None
    anchor_id: str | None = None
    order: int = 1


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
    return slug or "publicacao"


def build_toc_entry(document: ParsedDocument, order: int = 1) -> TocEntry:
    # Titulos quebrados em varias linhas viram uma unica entrada logica.
    title = collapse_spaces(document.title or "") or None
    return TocEntry(
        category=document.category,
        document_title=title,
        table_of_contents_title=collapse_spaces(
            document.table_of_contents_title or ""
        ) or title,
        anchor_id=slugify(title) if title else None,
        order=order,
    )
