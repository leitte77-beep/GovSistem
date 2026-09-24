"""Orquestrador do pipeline de interpretacao do conteudo colado."""

from typing import Optional

from app.services.gazette.normalize import (
    collapse_spaces,
    normalize_text,
    sanitize_html,
)
from app.services.gazette.segmenter import segment_content
from app.services.gazette.state_machine import classify_segments
from app.services.gazette.types import (
    TEMPLATE_EXTRACT_FIELDS,
    TEMPLATE_NORMATIVE_ACT,
    BlockType,
    ParsedDocument,
    detect_document_type,
)


def parse_document(
    plain_text: Optional[str] = None,
    source_html: Optional[str] = None,
) -> ParsedDocument:
    """Executa o pipeline deterministico: sanitiza, segmenta e classifica."""
    clean_html = sanitize_html(source_html) if source_html else None
    segments, normalized = segment_content(plain_text, clean_html)
    blocks, warnings = classify_segments(segments)

    document = ParsedDocument(
        source_plain_text=normalize_text(plain_text or ""),
        source_html=clean_html,
        normalized_text=normalized,
        blocks=blocks,
        warnings=warnings,
    )

    all_blocks = list(document.iter_blocks())
    titles = [b for b in all_blocks if b.type == BlockType.DOCUMENT_TITLE]
    categories = [b for b in all_blocks if b.type == BlockType.CATEGORY]
    fields = [b for b in all_blocks if b.type == BlockType.FIELD]
    commands = [b for b in all_blocks if b.type == BlockType.COMMAND]
    articles = [b for b in all_blocks if b.type == BlockType.ARTICLE]

    if titles:
        document.title = collapse_spaces(titles[0].original_text)
        document.table_of_contents_title = document.title
    if categories:
        document.category = collapse_spaces(categories[0].original_text)

    type_spec = detect_document_type(document.title)
    document.document_type = type_spec.id
    document.template = type_spec.template

    # Ajustes de template guiados pela estrutura encontrada.
    if type_spec.id == "generic":
        if commands and articles:
            document.template = TEMPLATE_NORMATIVE_ACT
        elif len(fields) >= 3:
            document.template = TEMPLATE_EXTRACT_FIELDS

    if not document.title:
        document.document_type = "generic"

    if all_blocks:
        document.confidence = round(
            sum(b.confidence for b in all_blocks) / len(all_blocks), 4
        )

    return document
