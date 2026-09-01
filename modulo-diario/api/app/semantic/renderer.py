"""Single semantic renderer (Fase 10).

``render_document(doc, config, media=...)`` produces safe, deterministic HTML
from the SAME semantic document and the SAME validated template tokens. The
editor, review, public page and PDF all use this renderer so no business rule
is duplicated. Print media adds A4-oriented CSS; screen media is responsive.

Assets are resolved locally only (no arbitrary external network fetches).
"""

from __future__ import annotations

import html as _html_mod
import re
from typing import Optional

from .schemas import SemanticDocument
from .templates import TemplateConfig

_BLOCK_CLASS = "doe-block doe-block--{type}"
_CONTAINER = "doe-document"
_SAFE_RE = re.compile(r"[^a-zA-Z0-9_-]")


def _esc(value: str | int | None) -> str:
    return _html_mod.escape(str(value or ""), quote=True)


_SAFE_SCHEME_RE = re.compile(r"^([a-zA-Z][a-zA-Z0-9+.-]*):")


def _safe_url(value: str) -> str:
    """Return a URL only when it uses an allowed scheme.

    Blocks javascript:, vbscript:, data: (except data:image/*) and other
    executable schemes. Escapes everything for safe use in attributes.
    """
    raw = (value or "").strip()
    if not raw:
        return ""
    match = _SAFE_SCHEME_RE.match(raw)
    if match:
        scheme = match.group(1).lower()
        if scheme in ("javascript", "vbscript", "file"):
            return ""
        if scheme == "data" and not raw.lower().startswith("data:image/"):
            return ""
    return _esc(raw)


def _safe_id(value: str) -> str:
    cleaned = _SAFE_RE.sub("-", value or "")
    return cleaned.strip("-") or "bloco"


def _css_vars(config: Optional[TemplateConfig]) -> str:
    if not config or not config.tokens:
        return ""
    props = []
    for key, value in config.tokens.items():
        var = f"--doe-{key.replace('.', '-')}"
        props.append(f"{var}: {value};")
    return "\n".join(props)


def _media_css(media: str, config: Optional[TemplateConfig]) -> str:
    base = """
.doe-document { font-family: var(--doe-typography-body-family, 'Liberation Serif');
  font-size: var(--doe-typography-body-size, 11pt);
  line-height: var(--doe-typography-body-line-height, 1.4);
  color: #111; max-width: 100%; }
.doe-block { margin: 0 0 0.6em 0; }
.doe-block--heading { text-align: var(--doe-title-alignment, center);
  font-family: var(--doe-typography-title-family);
  font-size: var(--doe-typography-title-size);
  font-weight: var(--doe-typography-title-weight); margin: 0.8em 0 0.4em; }
.doe-block--heading h1, .doe-block--heading h2 { margin: 0; }
.doe-block--command { text-align: var(--doe-blocks-command-alignment, center);
  font-weight: bold; margin: 0.8em 0; }
.doe-block--preamble { text-align: var(--doe-blocks-preamble-alignment, justify); }
.doe-block--paragraph { text-align: var(--doe-blocks-paragraph-alignment, justify);
  text-indent: var(--doe-blocks-paragraph-indent, 1.25cm); }
.doe-block--article { margin: 0.6em 0; }
.doe-block--article .doe-caput { text-align: justify;
  text-indent: var(--doe-blocks-article-indent, 1.25cm); }
.doe-block--article .doe-paragraphs, .doe-block--article .doe-incisos,
.doe-block--article .doe-alineas { margin: 0.2em 0 0.2em 2em; }
.doe-table { width: 100%; border-collapse: collapse; margin: 0.8em 0;
  table-layout: auto; }
.doe-table caption { font-weight: bold; margin-bottom: 0.4em; text-align: left; }
.doe-table th, .doe-table td { border: var(--doe-tables-border-width, 0.75pt)
  solid var(--doe-tables-border-color, #000);
  padding: var(--doe-tables-cell-padding, 4pt); vertical-align: top; }
.doe-table thead th { background: var(--doe-tables-header-background, #e8e8e8);
  font-weight: var(--doe-tables-header-weight, bold); }
.doe-table .doe-total { font-weight: bold; background: #f4f4f4; }
.doe-signature { margin: 2em 0 0; text-align: var(--doe-signature-alignment, center); }
.doe-signature .doe-sign-name { font-weight: var(--doe-signature-name-weight, bold); }
.doe-signature .doe-sign-role { font-weight: var(--doe-signature-role-weight, normal); }
.doe-page-break { page-break-before: always; }
.doe-list ul, .doe-list ol { margin: 0.3em 0 0.3em 1.5em; }
.doe-quote { font-style: italic; margin: 0.6em 1.5em; }
.doe-image img { max-width: 100%; height: auto; }
"""
    if media == "print":
        base += """
@page { size: A4; margin: var(--doe-page-margin-top, 2cm)
  var(--doe-page-margin-right, 2cm) var(--doe-page-margin-bottom, 2cm)
  var(--doe-page-margin-left, 2.5cm); }
.doe-document { -weasy-zoom: 1; }
.doe-table thead { display: table-header-group; }
.doe-page-break { page-break-before: always; }
"""
    else:
        base += """
.doe-document { max-width: 210mm; margin: 0 auto; }
.doe-table-wrap { overflow-x: auto; }
"""
    return base


def render_document(
    doc: SemanticDocument,
    config: Optional[TemplateConfig] = None,
    media: str = "screen",
) -> str:
    """Render a SemanticDocument to safe HTML.

    ``media`` is ``"screen"`` (responsive) or ``"print"`` (A4 + WeasyPrint).
    """
    if media not in ("screen", "print"):
        media = "screen"

    css_vars = _css_vars(config)
    media_css = _media_css(media, config)

    body_parts: list[str] = []
    for block in doc.blocks:
        body_parts.append(_render_block(block))

    body = "\n".join(body_parts)
    return (
        '<div class="doe-document"'
        + (f' style="{css_vars}"' if css_vars else "")
        + '>\n'
        + _render_header(doc)
        + body
        + _render_footer(doc)
        + "\n</div>\n<style>" + media_css + "</style>"
    )


def _render_header(doc: SemanticDocument) -> str:
    return f'<h1 class="doe-block doe-block--heading">{_esc(doc.title or doc.document_type)}</h1>\n'


def _render_footer(doc: SemanticDocument) -> str:
    parts = []
    if doc.summary:
        parts.append(
            f'<p class="doe-summary"><strong>Súmula:</strong> {_esc(doc.summary)}</p>'
        )
    if doc.text_integrity_hash:
        parts.append(
            f'<p class="doe-integrity">Hash de integridade textual: '
            f'{_esc(doc.text_integrity_hash)}</p>'
        )
    return "\n".join(parts) + "\n"


def _render_block(block) -> str:
    cls = _BLOCK_CLASS.format(type=block.type)
    btype = block.type

    if btype == "heading":
        tag = f"h{block.level}" if 1 <= block.level <= 6 else "h2"
        inner = _esc(block.text)
        return f'<div class="{cls}"><{tag}>{inner}</{tag}></div>'

    if btype in ("preamble", "paragraph", "quote"):
        return (
            f'<div class="{cls}" id="{_safe_id(block.id)}">'
            f'{_render_rich(block.content)}</div>'
        )

    if btype == "command":
        return f'<div class="{cls}">{_esc(block.text)}</div>'

    if btype == "paragraph_item":
        num = f"§ {block.number}" if block.number else "Parágrafo único"
        return (
            f'<div class="{cls}"><p><strong>{_esc(num)}.</strong> '
            f"{_render_rich(block.content)}</p></div>"
        )

    if btype == "inciso":
        return (
            f'<div class="{cls}"><p>{_esc(block.number)} – '
            f"{_render_rich(block.content)}</p></div>"
        )

    if btype == "alinea":
        return (
            f'<div class="{cls}"><p>{_esc(block.number)}) '
            f"{_render_rich(block.content)}</p></div>"
        )

    if btype == "article":
        return _render_article(block, cls)

    if btype == "list":
        tag = "ol" if block.ordered else "ul"
        items = "".join(f"<li>{_render_rich(i)}</li>" for i in block.items)
        return f'<div class="{cls}"><{tag}>{items}</{tag}></div>'

    if btype == "table":
        return f'<div class="doe-table-wrap">{_render_table(block, cls)}</div>'

    if btype == "image":
        caption = f"<figcaption>{_esc(block.caption)}</figcaption>" if block.caption else ""
        return (
            f'<div class="{cls}"><figure><img src="{_safe_url(block.src)}" '
            f'alt="{_esc(block.alt)}" loading="lazy"/>{caption}</figure></div>'
        )

    if btype == "page_break":
        return '<div class="doe-block doe-page-break" aria-hidden="true"></div>'

    if btype == "signature_block":
        return _render_signature(block, cls)

    if btype == "attachment_reference":
        return (
            f'<div class="{cls}"><p>Anexo: <strong>{_esc(block.title)}</strong>'
            f" ({_esc(block.filename)})</p></div>"
        )

    if btype == "legacy_html":
        from app.core.html_sanitizer import sanitize_html

        return f'<div class="{cls}">{sanitize_html(block.content)}</div>'

    if btype == "pdf_reference":
        return (
            f'<div class="{cls}"><p>Documento em PDF original — '
            f"{_esc(block.page_count)} página(s). Conteúdo não editável por blocos.</p>"
            f'<p><a href="{_safe_url(block.src)}" rel="noopener noreferrer">'
            "Abrir PDF original</a></p></div>"
        )

    # fallback: generic rich text
    return f'<div class="{cls}">{_render_rich(getattr(block, "content", ""))}</div>'


def _render_article(block, cls: str) -> str:
    label = block.suffix or block.number or "Art."
    if block.suffix:
        label = f"Art. {label}"
    elif block.number:
        label = f"Art. {label}"
    else:
        label = "Art."

    parts = [f'<div class="{cls}" id="{_safe_id(block.id)}">']
    parts.append(
        f'<p class="doe-caput"><strong>{_esc(label)}.</strong> '
        f"{_render_rich(block.caput)}</p>"
    )
    if block.paragraphs:
        parts.append('<div class="doe-paragraphs">')
        for p in block.paragraphs:
            num = f"§ {p.number}" if p.number else "Parágrafo único"
            parts.append(
                f'<p><strong>{_esc(num)}.</strong> {_render_rich(p.content)}</p>'
            )
        parts.append("</div>")
    if block.incisos:
        parts.append('<div class="doe-incisos">')
        for inc in block.incisos:
            parts.append(f'<p>{_esc(inc.number)} – {_render_rich(inc.content)}</p>')
        parts.append("</div>")
    if block.alineas:
        parts.append('<div class="doe-alineas">')
        for al in block.alineas:
            parts.append(f'<p>{_esc(al.number)}) {_render_rich(al.content)}</p>')
        parts.append("</div>")
    parts.append("</div>")
    return "\n".join(parts)


def _render_table(block, cls: str) -> str:
    caption = f"<caption>{_esc(block.caption)}</caption>" if block.caption else ""
    repeat = " true" if getattr(block, "repeat_header", True) else ""
    thead = ""
    if block.headers:
        cells = "".join(
            f"<th scope='col'>{_esc(h)}</th>" for h in block.headers
        )
        thead = f"<thead><tr>{cells}</tr></thead>"
    tbody_rows = []
    for row in block.rows:
        cells = []
        for cell in row:
            attrs = []
            if cell.colspan > 1:
                attrs.append(f"colspan='{cell.colspan}'")
            if cell.rowspan > 1:
                attrs.append(f"rowspan='{cell.rowspan}'")
            if cell.align:
                attrs.append(f"align='{_esc(cell.align)}'")
            if cell.valign:
                attrs.append(f"valign='{_esc(cell.valign)}'")
            cls_extra = " doe-total" if cell.is_total else ""
            tag = "th" if cell.header else "td"
            if cell.header:
                attrs.append("scope='col'")
            attrs_str = (" " + " ".join(attrs)) if attrs else ""
            cells.append(
                f"<{tag}{attrs_str} class='{cls_extra.strip() or ''}'>"
                f"{_render_rich(cell.content)}</{tag}>"
            )
        tbody_rows.append(f"<tr>{''.join(cells)}</tr>")
    tbody = "<tbody>" + "\n".join(tbody_rows) + "</tbody>" if tbody_rows else ""
    return (
        f"<table class='doe-table{repeat}'>{caption}{thead}{tbody}</table>"
    )


def _render_signature(block, cls: str) -> str:
    parts = [f'<div class="{cls}">']
    for entry in block.entries:
        loc = f"<p>{_esc(entry.location)}, {_esc(entry.date)}</p>" if (entry.location or entry.date) else ""
        parts.append(
            '<div class="doe-signature">'
            f'<p class="doe-sign-name">{_esc(entry.name)}</p>'
            f'<p class="doe-sign-role">{_esc(entry.role)}</p>'
            + (f"<p>{_esc(entry.organ)}</p>" if entry.organ else "")
            + loc
            + "</div>"
        )
    parts.append("</div>")
    return "\n".join(parts)


def _render_rich(content: str) -> str:
    """Render rich text content as safe HTML.

    Content blocks store sanitized HTML; we re-sanitize defensively so the
    renderer never emits executable markup regardless of input provenance.
    """
    from app.core.html_sanitizer import sanitize_html

    if not content:
        return ""
    return sanitize_html(content)
