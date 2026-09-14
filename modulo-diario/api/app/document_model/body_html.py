"""Renderização única do **corpo semântico** de um documento oficial.

Fonte da verdade compartilhada entre:
  * ``render_html.py`` — preview/PDF de modelos documentais (Fase 3);
  * ``ingest.py`` — ``content_html`` persistido da matéria, consumido pelo PDF
    de edições (``services/edition_pdf.py``).

Assim, o mesmo ``SemanticDocument`` produz exatamente o mesmo HTML no preview
do modelo e no Diário Oficial publicado. O CSS do corpo vive em
``DOCUMENT_BODY_CSS`` (escopo ``.doc-body``) e é injetado nos dois destinos.

Nada aqui reescreve texto: os blocos vêm do renderizador determinístico
(``app.document_model.renderer``), que só interpola valores validados.
"""

from __future__ import annotations

import html
from typing import Any, Optional

_ROMAN = [
    (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
    (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
    (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
]


def roman(value: int) -> str:
    out = ""
    n = max(1, value)
    for amount, symbol in _ROMAN:
        while n >= amount:
            out += symbol
            n -= amount
    return out


def letter(value: int) -> str:
    n = max(1, value)
    out = ""
    while n > 0:
        n, rem = divmod(n - 1, 26)
        out = chr(ord("a") + rem) + out
    return out


def esc(value: Optional[Any]) -> str:
    return html.escape("" if value is None else str(value))


def align(value: Optional[str], default: str = "justify") -> str:
    v = (value or default).lower()
    return v if v in {"left", "center", "right", "justify"} else default


def block_content(block) -> str:
    """Read canonical ``content`` while accepting legacy ``text`` snapshots."""
    content = getattr(block, "content", None)
    return content if content not in (None, "") else getattr(block, "text", "")


def article_html(block, index: int) -> str:
    number = block.number or str(index)
    label = f"Art. {number}º"
    if block.suffix:
        label = f"{label}-{block.suffix}"
    parts = [f'<p class="doc-article"><span class="art-num">{esc(label)}</span> ']
    parts.append(f'<span class="caput">{esc(block.caput)}</span></p>')
    for i, p in enumerate(block.paragraphs, start=1):
        num = p.number or "Parágrafo único"
        prefix = f"§ {num}º" if p.number else "Parágrafo único."
        parts.append(
            f'<p class="doc-paragraph-item">'
            f'<span class="num">{esc(prefix)}</span> {esc(block_content(p))}</p>'
        )
    for i, inc in enumerate(block.incisos, start=1):
        num = inc.number or roman(i)
        parts.append(
            f'<p class="doc-inciso"><span class="num">{esc(num)}</span> '
            f'{esc(block_content(inc))}</p>'
        )
    for i, al in enumerate(block.alineas, start=1):
        num = al.number or letter(i)
        suffix = "" if str(num).endswith(")") else ")"
        parts.append(
            f'<p class="doc-alinea">'
            f'<span class="num">{esc(num + suffix)}</span> {esc(block_content(al))}</p>'
        )
    return "".join(parts)


def signature_html(block) -> str:
    entries = []
    for e in block.entries:
        meta = " · ".join(x for x in [e.organ, e.location, e.date] if x)
        pos = align(getattr(e, "position", None), block.alignment or "center")
        line_margin = {
            "left": "0 auto 1mm 0",
            "right": "0 0 1mm auto",
            "center": "0 auto 1mm",
        }[pos]
        meta_html = f'<div class="sign-meta">{esc(meta)}</div>' if meta else ""
        entries.append(
            f'<div class="sign-entry" style="text-align:{pos}">'
            f'<div class="sign-line" style="margin:{line_margin}"></div>'
            f'<div class="sign-name">{esc(e.name).upper()}</div>'
            f'<div class="sign-role">{esc(e.role)}</div>'
            f'{meta_html}'
            "</div>"
        )
    return f'<div class="doc-signature">{ "".join(entries) }</div>'


def blocks_to_html(document) -> str:
    """HTML canônico determinístico do corpo (compartilhado preview/edição)."""
    out: list[str] = []
    article_index = 0
    for block in document.blocks:
        btype = getattr(block, "type", "")
        if btype == "heading":
            out.append(f'<h{block.level} class="doc-heading">{esc(block.text)}</h{block.level}>')
        elif btype == "command":
            out.append(f'<p class="doc-command">{esc(block.text)}</p>')
        elif btype == "preamble":
            out.append(f'<p class="doc-preamble">{esc(block.content)}</p>')
        elif btype == "paragraph":
            out.append(f'<p class="doc-paragraph">{esc(block.content)}</p>')
        elif btype == "quote":
            out.append(f'<blockquote class="doc-quote">{esc(block.content)}</blockquote>')
        elif btype == "article":
            article_index += 1
            out.append(article_html(block, article_index))
        elif btype == "signature_block":
            out.append(signature_html(block))
        elif btype == "attachment_reference":
            out.append(f'<p class="doc-attachment">{esc(block.title)}</p>')
        elif btype == "page_break":
            out.append('<div class="doc-page-break"></div>')
    return "\n".join(out)


# CSS do corpo, escopado em ``.doc-body`` — o mesmo markup/CSS é usado no
# preview do modelo (``render_html``) e no conteúdo da edição publicada.
DOCUMENT_BODY_CSS = """
.doc-body { orphans: 2; widows: 2; }
.doc-body .doc-heading { font-size: 1.05em; font-weight: bold; margin: 4mm 0 2mm;
  break-after: avoid; page-break-after: avoid; }
.doc-body .doc-command { text-align: center; font-weight: bold; margin: 4mm 0;
  break-after: avoid; page-break-after: avoid; }
.doc-body .doc-preamble { text-align: justify; margin: 2mm 0; }
.doc-body .doc-paragraph { text-align: justify; text-indent: 2em; margin: 2mm 0; }
.doc-body .doc-quote { margin: 2mm 0 2mm 4mm; font-style: italic; }
.doc-body .doc-article { text-align: justify; margin: 2.5mm 0; }
.doc-body .doc-article .art-num { font-weight: bold; }
.doc-body .doc-paragraph-item { text-align: justify; margin: 1.5mm 0 1.5mm 2em; }
.doc-body .doc-inciso { text-align: justify; margin: 1.5mm 0 1.5mm 3em; }
.doc-body .doc-alinea { text-align: justify; margin: 1.5mm 0 1.5mm 4em; }
.doc-body .doc-inciso .num,
.doc-body .doc-alinea .num,
.doc-body .doc-paragraph-item .num { font-weight: bold; margin-right: 0.4em; }
.doc-body .doc-signature { margin-top: 14mm; text-align: center; }
.doc-body .sign-entry { margin-bottom: 10mm; page-break-inside: avoid; break-inside: avoid; }
.doc-body .sign-line { border-top: 1px solid #000; width: 70mm; }
.doc-body .sign-name { font-weight: bold; text-transform: uppercase; }
.doc-body .sign-role { font-size: 0.95em; }
.doc-body .sign-meta { font-size: 0.8em; color: #444; }
.doc-body .doc-attachment { margin: 3mm 0; font-weight: bold; }
.doc-body .doc-page-break { page-break-after: always; }
"""


__all__ = [
    "blocks_to_html",
    "signature_html",
    "article_html",
    "roman",
    "letter",
    "esc",
    "align",
    "block_content",
    "DOCUMENT_BODY_CSS",
]
