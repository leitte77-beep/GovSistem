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


def _media_css(
    media: str, config: Optional[TemplateConfig], include_page_rules: bool = True
) -> str:
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
.doe-block--considerando { text-align: var(--doe-blocks-considerando-alignment, justify);
  margin-left: var(--doe-blocks-considerando-indent, 0);
  text-indent: var(--doe-blocks-considerando-text-indent, 0); }
.doe-summary { text-align: var(--doe-blocks-summary-alignment, center);
  font-style: italic; margin: 0.4em 0 1em; break-inside: avoid; }
.doe-block--paragraph { text-align: var(--doe-blocks-paragraph-alignment, justify);
  text-indent: var(--doe-blocks-paragraph-indent, 1.25cm); }
/* Compact 'Label: value' fields (contracts/extracts): no indent, left aligned. */
.doe-document .doe-field, .doe-document .doe-field p { text-indent: 0;
  text-align: left; margin-left: 0; }
.doe-block--article { margin: 0.6em 0; }
.doe-block--article .doe-caput { text-align: justify;
  text-indent: var(--doe-blocks-article-indent, 1.25cm); }
.doe-block--article .doe-paragraphs, .doe-block--article .doe-incisos,
.doe-block--article .doe-alineas { margin: 0.2em 0 0.2em 2em; }
/* Legal typography for enumerations: justified with hanging indent. These
   selectors are intentionally more specific than container rules (e.g. the
   edition layout's `.matter-content p { text-align: start }`) so the semantic
   document always keeps its editorial formatting in screen and print. */
.doe-document .doe-paragraphs p { text-align: justify; margin-left: 1.5em;
  text-indent: -1em; }
.doe-document .doe-incisos p { text-align: justify; margin-left: 1.5em;
  text-indent: -1em; }
.doe-document .doe-alineas p { text-align: justify; margin-left: 2.5em;
  text-indent: -1em; }
.doe-block--inciso p, .doe-block--alinea p { text-align: justify; }
.doe-table { width: 100%; border-collapse: collapse; margin: 0.8em 0;
  table-layout: auto; }
.doe-table caption { font-weight: bold; margin-bottom: 0.4em; text-align: left; }
.doe-table th, .doe-table td { border: var(--doe-tables-border-width, 0.75pt)
  solid var(--doe-tables-border-color, #000);
  padding: var(--doe-tables-cell-padding, 4pt); vertical-align: top;
  overflow-wrap: break-word; word-break: normal; hyphens: none; }
.doe-table .doe-cell--nowrap { white-space: nowrap; }
.doe-table .doe-cell--num { white-space: nowrap; text-align: right;
  font-variant-numeric: tabular-nums; }
.doe-table--wide th, .doe-table--wide td { padding: 2pt 3pt; }
.doe-table thead th { background: var(--doe-tables-header-background, #e8e8e8);
  font-weight: var(--doe-tables-header-weight, bold); }
.doe-table .doe-total { font-weight: bold; background: #f4f4f4; }
.doe-signature { margin: 2em 0 0; text-align: var(--doe-signature-alignment, center);
  break-inside: avoid; page-break-inside: avoid; }
.doe-signature .doe-sign-name { font-weight: var(--doe-signature-name-weight, bold); }
.doe-signature .doe-sign-role { font-weight: var(--doe-signature-role-weight, normal); }
.doe-page-break { page-break-before: always; }
.doe-list ul, .doe-list ol { margin: 0.3em 0 0.3em 1.5em; }
.doe-quote { font-style: italic; margin: 0.6em 1.5em; }
.doe-image img { max-width: 100%; height: auto; }
/* Editorial pagination: never orphan a title/summary or split a signature. */
.doe-document p { orphans: 2; widows: 2; }
.doe-block--heading, .doe-summary { break-after: avoid; page-break-after: avoid; }
.doe-block--command { break-after: avoid; page-break-after: avoid; }
.doe-table { break-inside: auto; }
.doe-table tr { break-inside: avoid; page-break-inside: avoid; }
"""
    if media == "print":
        base += """
.doe-document { -weasy-zoom: 1; }
.doe-table thead { display: table-header-group; }
.doe-page-break { page-break-before: always; }
"""
        if include_page_rules:
            base += """
@page { size: A4; margin: var(--doe-page-margin-top, 2cm)
  var(--doe-page-margin-right, 2cm) var(--doe-page-margin-bottom, 2cm)
  var(--doe-page-margin-left, 2.5cm); }
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
    include_style: bool = True,
    include_page_rules: bool = True,
) -> str:
    """Render a SemanticDocument to safe HTML.

    ``media`` is ``"screen"`` (responsive) or ``"print"`` (A4 + WeasyPrint).
    ``include_page_rules=False`` omits the ``@page`` block so the fragment can
    be embedded into the edition PDF, which owns the page geometry. The
    ``.doe-*`` styles are still emitted so the embedded content keeps its
    editorial formatting.
    """
    if media not in ("screen", "print"):
        media = "screen"

    css_vars = _css_vars(config)
    media_css = _media_css(media, config, include_page_rules=include_page_rules)

    body_parts: list[str] = []
    for block in doc.blocks:
        body_parts.append(_render_block(block))

    body = "\n".join(body_parts)
    result = (
        '<div class="doe-document"'
        + (f' style="{css_vars}"' if css_vars else "")
        + '>\n'
        + _render_header(doc)
        + _render_summary(doc)
        + body
        + _render_footer(doc)
        + "\n</div>\n"
    )
    if include_style:
        result += "<style>" + media_css + "</style>"
    return result


def _render_header(doc: SemanticDocument) -> str:
    return f'<h1 class="doe-block doe-block--heading">{_esc(doc.title or doc.document_type)}</h1>\n'


def _render_summary(doc: SemanticDocument) -> str:
    """Render the summary/ementa right below the title, keeping its label.

    The label is the one authored in the source ('SÚMULA'/'EMENTA'); it is
    never rewritten. Only when the source had no explicit heading do we fall
    back to 'SÚMULA' so the reader still knows what the paragraph is.
    """
    if not doc.summary:
        return ""
    label = (doc.summary_label or "SÚMULA").strip()
    return (
        f'<p class="doe-summary"><strong>{_esc(label)}:</strong> '
        f"{_render_rich(doc.summary)}</p>\n"
    )


def _render_footer(doc: SemanticDocument) -> str:
    # No summary here (it belongs below the title) and no integrity hash in the
    # public/printed body: hashes are surfaced on the verification page, not on
    # the legal document itself.
    return ""


def _render_block(block) -> str:
    cls = _BLOCK_CLASS.format(type=block.type)
    btype = block.type

    if btype == "heading":
        tag = f"h{block.level}" if 1 <= block.level <= 6 else "h2"
        inner = _esc(block.text)
        return f'<div class="{cls}"><{tag}>{inner}</{tag}></div>'

    if btype in ("preamble", "paragraph", "quote", "considerando"):
        extra = ""
        if (getattr(block, "metadata", {}) or {}).get("kind") == "field":
            extra = " doe-field"
        return (
            f'<div class="{cls}{extra}" id="{_safe_id(block.id)}">'
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


_NUMERIC_CELL_RE = re.compile(r"^[R$\s]*[-+]?\d[\d.,\s/%()ºª°-]*$")


def _table_font_size(ncols: int) -> str:
    if ncols >= 16:
        return "6pt"
    if ncols >= 13:
        return "6.5pt"
    if ncols >= 11:
        return "7pt"
    if ncols >= 9:
        return "7.5pt"
    if ncols >= 7:
        return "8pt"
    return ""


def _cell_extra_class(content: str) -> str:
    value = (content or "").strip()
    if not value:
        return ""
    if _NUMERIC_CELL_RE.match(value):
        return " doe-cell--num"
    if len(value) <= 18 and " " not in value:
        return " doe-cell--nowrap"
    return ""


def _render_table(block, cls: str) -> str:
    caption = f"<caption>{_esc(block.caption)}</caption>" if block.caption else ""
    widths = getattr(block, "column_widths", None) or []
    ncols = max(
        [len(block.headers) if block.headers else 0]
        + [len(row) for row in block.rows]
        + [0]
    )
    colgroup = ""
    if widths:
        ncols = max(ncols, len(widths))
        cols = "".join(f"<col style='width:{w:g}%'/>" for w in widths)
        colgroup = f"<colgroup>{cols}</colgroup>"
    wide = " doe-table--wide" if ncols >= 8 else ""
    style_bits = []
    font_size = _table_font_size(ncols)
    if font_size:
        style_bits.append(f"font-size:{font_size}")
    if widths:
        style_bits.append("table-layout:fixed")
    style = f" style='{';'.join(style_bits)}'" if style_bits else ""

    thead = ""
    rows = list(block.rows)
    header_rows = []
    while rows and rows[0] and all(cell.header for cell in rows[0]):
        header_rows.append(rows.pop(0))
    if header_rows:
        thead = "<thead>" + "".join(_render_row(r) for r in header_rows) + "</thead>"
    elif block.headers:
        cells = "".join(
            f"<th scope='col'>{_esc(h)}</th>" for h in block.headers
        )
        thead = f"<thead><tr>{cells}</tr></thead>"
    tbody = (
        "<tbody>" + "\n".join(_render_row(r) for r in rows) + "</tbody>"
        if rows else ""
    )
    return (
        f"<table class='doe-table{wide}' data-cols='{ncols}'{style}>"
        f"{caption}{colgroup}{thead}{tbody}</table>"
    )


def _render_row(row) -> str:
    return f"<tr>{''.join(_render_cell(cell) for cell in row)}</tr>"


def _render_cell(cell) -> str:
    attrs = []
    if cell.colspan > 1:
        attrs.append(f"colspan='{cell.colspan}'")
    if cell.rowspan > 1:
        attrs.append(f"rowspan='{cell.rowspan}'")
    if cell.align:
        attrs.append(f"align='{_esc(cell.align)}'")
    if cell.valign:
        attrs.append(f"valign='{_esc(cell.valign)}'")
    extra = _cell_extra_class(cell.content)
    base_cls = ("doe-total" if cell.is_total else "") + extra
    tag = "th" if cell.header else "td"
    if cell.header:
        attrs.append("scope='col'")
    attrs_str = (" " + " ".join(attrs)) if attrs else ""
    return (
        f"<{tag}{attrs_str} class='{base_cls.strip()}'>"
        f"{_render_rich(cell.content)}</{tag}>"
    )


def _render_signature(block, cls: str) -> str:
    parts = [f'<div class="{cls}">']
    for entry in block.entries:
        if entry.location and entry.date:
            loc = f"<p>{_esc(entry.location)}, {_esc(entry.date)}</p>"
        elif entry.location:
            loc = f"<p>{_esc(entry.location)}</p>"
        elif entry.date:
            loc = f"<p>{_esc(entry.date)}</p>"
        else:
            loc = ""
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
