"""Selecao automatica de template e renderizacao do HTML diagramado.

A IA/regras classificam; o template formata. Toda a formatacao visual vem
das classes semanticas gazette-* (definidas no CSS dos layouts de PDF e do
editor), nunca de decisao livre da IA.
"""

import html as html_lib

from bs4 import BeautifulSoup

from app.services.gazette.types import (
    Block,
    BlockType,
    ParsedDocument,
)


def _esc(text: str) -> str:
    return html_lib.escape(text, quote=False)


def _multiline(text: str) -> str:
    return "<br>".join(_esc(line) for line in text.split("\n"))


def _table_html(block: Block) -> str:
    raw = block.metadata.get("html") or ""
    if not raw:
        return f'<p class="gazette-body">{_multiline(block.original_text)}</p>'
    soup = BeautifulSoup(raw, "html.parser")
    table = soup.find("table")
    if table is None:
        return raw
    classes = set(table.get("class") or [])
    classes.add("gazette-table")
    table["class"] = sorted(classes)
    return str(soup)


def _field_html(block: Block) -> str:
    label = block.metadata.get("label")
    value = block.metadata.get("value", "")
    if label:
        return (
            f'<p class="gazette-field"><strong>{_esc(label)}:</strong> '
            f"{_esc(value)}</p>"
        )
    return f'<p class="gazette-field">{_multiline(block.original_text)}</p>'


_SIMPLE_RENDERERS: dict[BlockType, str] = {
    BlockType.SUMMARY: '<p class="gazette-summary">{text}</p>',
    BlockType.PREAMBLE: '<p class="gazette-preamble">{text}</p>',
    BlockType.CONSIDERATION: '<p class="gazette-consideration">{text}</p>',
    BlockType.COMMAND: '<p class="gazette-command"><strong>{text}</strong></p>',
    BlockType.ARTICLE: '<p class="gazette-article">{text}</p>',
    BlockType.PARAGRAPH: '<p class="gazette-paragraph">{text}</p>',
    BlockType.SOLE_PARAGRAPH: '<p class="gazette-sole-paragraph">{text}</p>',
    BlockType.SUBSECTION: '<p class="gazette-subsection">{text}</p>',
    BlockType.LETTER_ITEM: '<p class="gazette-letter-item">{text}</p>',
    BlockType.NUMBERED_ITEM: '<p class="gazette-numbered-item">{text}</p>',
    BlockType.BODY_PARAGRAPH: '<p class="gazette-body">{text}</p>',
    BlockType.COMPANY_INFORMATION: '<p class="gazette-company"><strong>{text}</strong></p>',
    BlockType.TOTAL_VALUE: '<p class="gazette-total-value"><strong>{text}</strong></p>',
    BlockType.LOCATION: '<p class="gazette-closing gazette-location">{text}</p>',
    BlockType.DATE: '<p class="gazette-closing gazette-date">{text}</p>',
    BlockType.SIGNATURE_NAME: (
        '<p class="gazette-signature gazette-signature-name">'
        "<strong>{text}</strong></p>"
    ),
    BlockType.SIGNATURE_ROLE: '<p class="gazette-signature gazette-signature-role">{text}</p>',
    BlockType.ANNEX_TITLE: '<h3 class="gazette-annex-title">{text}</h3>',
    BlockType.ANNEX_CONTENT: '<p class="gazette-annex-content">{text}</p>',
    BlockType.NOTICE: '<p class="gazette-notice">{text}</p>',
    BlockType.UNKNOWN: '<p class="gazette-body gazette-unknown">{text}</p>',
}


def _render_block(block: Block) -> str:
    if block.type == BlockType.TABLE:
        html = _table_html(block)
    elif block.type == BlockType.FIELD:
        html = _field_html(block)
    elif block.type == BlockType.CATEGORY:
        html = f'<h1 class="gazette-category">{_multiline(block.original_text)}</h1>'
    elif block.type == BlockType.DOCUMENT_TITLE:
        html = f'<h2 class="gazette-document-title">{_multiline(block.original_text)}</h2>'
    elif block.type == BlockType.DOCUMENT_SUBTITLE:
        html = f'<h3 class="gazette-document-subtitle">{_multiline(block.original_text)}</h3>'
    else:
        template = _SIMPLE_RENDERERS.get(
            block.type, '<p class="gazette-body">{text}</p>'
        )
        html = template.format(text=_multiline(block.original_text))

    children_html = "".join(_render_block(child) for child in block.children)
    return html + children_html


def render_document(document: ParsedDocument) -> str:
    """Gera o HTML final diagramado, semantico e previsivel."""
    parts = [_render_block(block) for block in document.blocks]
    return "".join(parts) or "<p></p>"
