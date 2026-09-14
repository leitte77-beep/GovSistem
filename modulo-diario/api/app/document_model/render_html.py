"""Renderização HTML/PDF de um modelo documental (Fase 3).

Um **único HTML/CSS** alimenta o preview (iframe) e o PDF (WeasyPrint),
garantindo aparência praticamente idêntica: mesmas margens, tamanho/orientação
de página, fonte, cabeçalho institucional, rodapé e quebras de página.

O cabeçalho e o rodapé usam *running elements* (CSS Paged Media), suportados
pelo WeasyPrint. No navegador o cabeçalho aparece no topo do documento; no PDF
ele se repete em todas as páginas.

Nada aqui reescreve texto: os blocos vêm do renderizador determinístico
(``app.document_model.renderer``), que só interpola valores validados.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Optional

from app.document_model.body_html import DOCUMENT_BODY_CSS
from app.document_model.body_html import align as _align
from app.document_model.body_html import blocks_to_html as _blocks_html
from app.document_model.body_html import esc as _esc
from app.document_model.layout import DocumentLayout
from app.document_model.renderer import RenderOutcome, render
from app.document_model.schemas import DocumentModelConfig


@dataclass
class RenderedDocument:
    html: str
    outcome: RenderOutcome


# ── Cabeçalho / rodapé ──────────────────────────────────────────────────────


def _institution_header_html(
    layout: DocumentLayout, institution: Optional[dict[str, Any]]
) -> str:
    header = layout.header
    if not header or not header.enabled:
        return ""
    inst = institution or {}
    lines: list[str] = []
    if header.show_coat_of_arms and layout.show_coat_of_arms:
        logo = layout.coat_of_arms_url or inst.get("logo_url")
        if logo:
            lines.append(f'<img class="inst-logo" src="{_esc(logo)}" alt="Brasão" />')
    if header.show_institution_name:
        lines.append(f'<div class="inst-name">{_esc(inst.get("name"))}</div>')
    if header.show_address:
        addr = ", ".join(
            p
            for p in [
                inst.get("address_street"),
                inst.get("address_number"),
                inst.get("address_district"),
                inst.get("address_city"),
                inst.get("state"),
            ]
            if p
        )
        cep = inst.get("address_postal_code")
        if cep:
            addr = f"{addr} — CEP {cep}" if addr else f"CEP {cep}"
        if addr:
            lines.append(f'<div class="inst-line">{_esc(addr)}</div>')
    if header.show_cnpj and inst.get("cnpj"):
        lines.append(f'<div class="inst-line">CNPJ: {_esc(inst.get("cnpj"))}</div>')
    contact: list[str] = []
    if header.show_phone and inst.get("phone"):
        contact.append(f"Tel: {inst['phone']}")
    if header.show_site and inst.get("site"):
        contact.append(str(inst["site"]))
    if contact:
        lines.append(f'<div class="inst-line">{_esc(" · ".join(contact))}</div>')
    if header.custom_html:
        lines.append(header.custom_html)
    align = _align(header.alignment, "center")
    return f'<div class="doc-header align-{align}">{"".join(lines)}</div>'


def _footer_content_css(layout: DocumentLayout) -> str:
    footer = layout.footer
    if not footer or not footer.enabled:
        return "none"
    if footer.custom_html:
        return "element(doc-footer)"
    if footer.show_page_numbers:
        fmt = footer.page_number_format or "Página {page} de {total}"
        tokens: list[str] = []
        for part in re.split(r"(\{page\}|\{total\})", fmt):
            if part == "{page}":
                tokens.append("counter(page)")
            elif part == "{total}":
                tokens.append("counter(pages)")
            elif part:
                tokens.append('"' + part.replace('"', '\\"') + '"')
        return " ".join(tokens) if tokens else "none"
    return "none"


def _footer_html(layout: DocumentLayout) -> str:
    footer = layout.footer
    if not footer or not footer.enabled or not footer.custom_html:
        return ""
    return (
        f'<div class="doc-footer align-{_align(footer.alignment, "center")}">'
        f"{footer.custom_html}</div>"
    )


# ── Documento completo ──────────────────────────────────────────────────────


def build_html(
    config: DocumentModelConfig,
    layout: DocumentLayout,
    raw_values: dict[str, Any],
    institution: Optional[dict[str, Any]] = None,
) -> RenderedDocument:
    outcome = render(config, raw_values)
    document = outcome.document

    margins = layout.margins
    body_font = layout.body_font
    heading_font = layout.heading_font or body_font

    header_css = "element(doc-header)" if (layout.header and layout.header.enabled) else "none"
    footer_css = _footer_content_css(layout)

    css = f"""
@page {{
  size: {layout.page_size} {layout.orientation};
  margin: {margins.top}mm {margins.right}mm {margins.bottom}mm {margins.left}mm;
  @top-center {{ content: {header_css}; }}
  @bottom-center {{ content: {footer_css}; }}
}}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; padding: 0; }}
body {{
  font-family: "{body_font.family}", serif;
  font-size: {body_font.size}pt;
  line-height: {body_font.line_height};
  color: {body_font.color};
  background: {layout.background_color};
}}
.doc-header {{ position: running(doc-header); width: 100%; }}
.doc-footer {{ position: running(doc-footer); width: 100%; font-size: 0.8em; color: #444; }}
.align-left {{ text-align: left; }}
.align-center {{ text-align: center; }}
.align-right {{ text-align: right; }}
.inst-logo {{ height: 18mm; display: block; margin: 0 auto 1mm; }}
.inst-name {{ font-weight: bold; font-size: 1.1em; text-transform: uppercase; }}
.inst-line {{ font-size: 0.78em; line-height: 1.25; }}
.doc-header {{ border-bottom: 1px solid #999; padding-bottom: 2mm; margin-bottom: 5mm; }}
.doc-title {{ text-align: center; font-weight: bold; font-size: 1.2em; text-transform: uppercase; margin: 0 0 2mm; }}
.doc-summary {{ text-align: center; font-style: italic; margin: 0 0 6mm; }}
.doc-body .doc-heading {{ font-family: "{heading_font.family}", serif; }}
{DOCUMENT_BODY_CSS}
"""

    title = _esc(document.title)
    summary = _esc(document.summary)
    body = _blocks_html(document)

    html_doc = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8" /><title>{title}</title><style>{css}</style></head>
<body>
{_institution_header_html(layout, institution)}
<main class="doc-body">
{f'<h1 class="doc-title">{title}</h1>' if title else ''}
{f'<p class="doc-summary">{summary}</p>' if summary else ''}
{body}
</main>
{_footer_html(layout)}
</body>
</html>"""
    return RenderedDocument(html=html_doc, outcome=outcome)


def render_pdf(html_doc: str) -> bytes:
    from weasyprint import HTML

    return HTML(string=html_doc).write_pdf()


__all__ = ["RenderedDocument", "build_html", "render_pdf"]
