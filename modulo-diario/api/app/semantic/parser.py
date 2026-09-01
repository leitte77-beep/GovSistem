"""Deterministic parser for official acts (Fase 4).

Turns normalized input into a ``SemanticDocument`` with typed blocks using
deterministic, regex-driven rules FIRST. No AI, no wording re-write.

Pipeline (one line, block by block):
  1. Tokenize into logical lines (preserving blank-line paragraph breaks).
  2. Detect structure: headings, preambles, commands, articles, paragraphs,
     incisos, alineas, lists, tables, signature blocks, location/date.
  3. Classify each token into a typed block.
  4. Validate sequence (e.g. an article must be followed by its paragraphs).
  5. Build the SemanticDocument.
  6. Compute source_hash and text_integrity_hash.
"""

from __future__ import annotations

import hashlib
import re
from typing import Optional

from .normalizer import normalize_input
from .schemas import (
    AlineaBlock,
    ArticleBlock,
    CLASSIFICATION_PENDING,
    CommandBlock,
    HeadingBlock,
    IncisoBlock,
    ListBlock,
    ORIGIN_DETERMINISTIC,
    ParagraphBlock,
    ParagraphItemBlock,
    PreambleBlock,
    SemanticDocument,
    SignatureBlock,
    SignatureEntry,
    TableBlock,
    TableCell,
    stable_id,
)

_COMMAND_RE = re.compile(
    r"^(DECRETA|RESOLVE|SANCIONA|TORNA\s+P[UÚ]BLICO|CONSIDERANDO|EXPEDE|"
    r"RESOLVE\s*[:.]|DETERMINA|DESIGNA|CONVOCA|INSTITUI|REVOGA)[:.\s]*$",
    re.IGNORECASE,
)
_ARTICLE_RE = re.compile(r"^Art\.?\s*([0-9IVXLCDM]+[ºªo\-A-Z0-9]*)?\s*(?:[:.-]\s*)?(.*)$", re.IGNORECASE)
_SOLE_PARAGRAPH_RE = re.compile(r"^P[AÁ]R[AÁ]GRAFO\s*[UÚ]NICO[:.\s]*(.*)$", re.IGNORECASE)
_PARAGRAPH_RE = re.compile(r"^§\s*([0-9ºª]*)\.?\s*(.*)$")
_INCISO_RE = re.compile(r"^\s*([IVXLCDM]+)\s*[-–:)\s]+(.*)$")
_ALINEA_RE = re.compile(r"^\s*([a-z])\s*\)\s*(.*)$")
_ITEM_RE = re.compile(r"^\s*([0-9]+)\s*\)\s*(.*)$")
_LIST_ITEM_RE = re.compile(r"^\s*[-•*]\s+(.*)$")
_ALL_CAPS_HEADING_RE = re.compile(
    r"^(?=.{3,120}$)(?=.*[A-ZÀ-Ú])(?!.*[a-zà-ú])[A-Z0-9À-Ú/.,:;ºª()\[\]º\- ]+$"
)
_SECTION_HEADING_RE = re.compile(
    r"^(SECRETARIA|PREFEITURA|MUNIC[IP]PIO|GABINETE|LEI|DECRETO|PORTARIA|"
    r"RESOLU[CÇ][AÃ]O|EDITAL|CONTRATO|AVISO|ATAS?|RELAT[OÓ]RIO|LICITA[CÇ][AÃ]O)"
    r"[\s.]*(?:N[º°]\s*\d+)?",
    re.IGNORECASE,
)
_LOCATION_DATE_RE = re.compile(
    r"^(?P<city>[A-ZÀ-Ú][\wÀ-ú ]{2,}),\s+(?P<day>\d{1,2})\s+DE\s+"
    r"(?P<month>JANEIRO|FEVEREIRO|MAR[ÇC]O|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|"
    r"SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s+DE\s+(?P<year>\d{4})\s*$",
    re.IGNORECASE,
)
_SIGNATURE_RE = re.compile(
    r"^(?P<name>[\wÀ-ú.'-]{2,})\s*$|^(?P<carrier>Cargo|Prefeit[oa]|"
    r"Secret[áa]ri[oa]|Diretor|Diretoria|Assinatura|Respons[áa]vel)[\wÀ-ú ]*$",
    re.IGNORECASE,
)

_CONFIRM_LOW = 0.35
_CONFIRM_MED = 0.6
_CONFIRM_HIGH = 0.9


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _block(btype, **kw):
    """Factory that forces deterministic origin + a base confidence."""
    kw.setdefault("id", stable_id())
    kw.setdefault("origin", ORIGIN_DETERMINISTIC)
    return btype(**kw)


def _compute_source_hash(html: str | None, text: str, tabs: Optional[list]) -> str:
    raw = "\n".join(
        [
            html or "",
            text,
            "\n".join("\t".join(r) for r in (tabs or [])),
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def parse_document(
    *,
    html: str | None = None,
    plain: str | None = None,
    title: str = "",
    summary: str = "",
    document_type: str = "ato_oficial",
) -> SemanticDocument:
    """Parse normalized input into a SemanticDocument."""
    norm = normalize_input(html=html, plain=plain)
    source_type = norm["source_type"]
    text = norm["text"]

    blocks = []
    if norm["tabs"]:
        blocks.append(_build_table_block(norm["tabs"]))
        text_for_parse = ""
    elif norm["html"]:
        blocks = _parse_html(norm["html"], fallback_text=text)
        text_for_parse = ""
    else:
        text_for_parse = text

    if not blocks and text_for_parse.strip():
        blocks = _parse_lines(text_for_parse)

    if title and not blocks:
        blocks.append(_block(HeadingBlock, level=1, text=title))

    doc = SemanticDocument(
        document_type=document_type,
        title=title,
        summary=summary,
        source_type=source_type,
        blocks=blocks,
        classification_status=CLASSIFICATION_PENDING,
    )

    # Integrity
    if norm["html"]:
        from .integrity import compute_document_integrity

        source_rep = norm["text"]
    else:
        source_rep = text
    from .integrity import compute_text_integrity

    integrity = compute_text_integrity(source_rep, doc)
    doc.text_integrity_hash = integrity["hash"]
    doc.source_hash = _compute_source_hash(norm["html"], text, norm["tabs"])
    return doc


# ── HTML pass ────────────────────────────────────────────────────────────────


def _split_html_blocks(html: str) -> list[dict]:
    """Split sanitized HTML into top-level block chunks preserving order.

    Uses the stdlib ``html.parser`` so nested tags (e.g. <p><strong>DECRETA:</strong></p>)
    are captured correctly instead of being lost by a regex.
    """
    import html as html_mod
    from html.parser import HTMLParser

    TOP_LEVEL = {
        "p", "div", "section", "h1", "h2", "h3", "h4", "h5", "h6",
        "ul", "ol", "blockquote", "img", "hr", "table",
    }
    TEXT_ONLY = {"strong", "em", "b", "i", "u", "s", "a", "span", "br",
                 "sub", "sup", "code", "abbr", "li", "th", "td", "tr",
                 "thead", "tbody", "caption", "font"}

    class _Splitter(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.top = []          # list of {kind, inner, raw}
            self._stack = []       # (kind, is_top)
            self._buf = []         # text buffer
            self._raw = []         # raw html buffer

        def _tag_html(self):
            return self.get_starttag_text() or ""

        def handle_starttag(self, tag, attrs):
            if not self._stack:
                if tag in TOP_LEVEL:
                    self._stack.append((tag, True))
                    self._buf = []
                    self._raw = []
                    self._raw.append(self._tag_html())
                else:
                    self.top.append({"kind": "text", "inner": self.get_starttag_text(), "raw": self.get_starttag_text()})
            else:
                self._stack.append((tag, False))
                self._raw.append(self._tag_html())

        def handle_startendtag(self, tag, attrs):
            if not self._stack and tag == "img":
                self.top.append({"kind": "img", "inner": self.get_starttag_text(), "raw": self.get_starttag_text()})

        def handle_endtag(self, tag):
            if not self._stack:
                return
            for i in range(len(self._stack) - 1, -1, -1):
                kind, is_top = self._stack[i]
                if kind == tag:
                    if not is_top:
                        # capture the closing tag in the raw buffer
                        self._raw.append(f"</{tag}>")
                    else:
                        self.top.append({
                            "kind": tag,
                            "inner": "".join(self._buf),
                            "raw": "".join(self._raw),
                        })
                        self._buf = []
                        self._raw = []
                    del self._stack[i:]
                    return
            if self._stack:
                self._raw.append(f"</{tag}>")

        def handle_data(self, data):
            if self._stack:
                self._buf.append(data)
                self._raw.append(data)

    p = _Splitter()
    try:
        p.feed(html or "")
        p.close()
    except Exception:  # noqa: BLE001 - never crash on malformed input
        return []
    return p.top


def _parse_html(html: str, fallback_text: str = "") -> list:
    """Best-effort HTML parse producing blocks; falls back to line parsing."""
    tokens = _split_html_blocks(html)
    blocks: list = []
    for tok in tokens:
        kind = tok["kind"]
        raw = tok.get("raw") or tok.get("inner") or ""
        if kind == "table":
            blocks.append(_build_table_from_html(raw))
        elif kind in ("p", "div", "section"):
            inner = _inner_text(tok.get("inner", ""))
            classified = _classify_text_line(inner, blocks)
            if classified is not None:
                blocks.append(classified)
        elif kind in ("h1", "h2", "h3", "h4", "h5", "h6"):
            level = int(kind[1])
            blocks.append(_block(HeadingBlock, level=level,
                                 text=_inner_text(tok.get("inner", ""))))
        elif kind in ("ul", "ol"):
            blocks.append(_build_list_from_html(raw))
        elif kind == "blockquote":
            blocks.append(_block(ParagraphBlock,
                                 content=_inner_text(tok.get("inner", "")),
                                 confidence=_CONFIRM_MED))
        elif kind == "img":
            blocks.append(_block(ImageBlock, src=raw, alt="", confidence=_CONFIRM_MED))
    if not blocks and fallback_text.strip():
        blocks = _parse_lines(fallback_text)
    return blocks


def _inner_text(html: str) -> str:
    from app.semantic.schemas import _strip_html

    return _strip_html(html)


def _classify_text_line(text: str, blocks: list) -> Optional[object]:
    """Classify a single line (from HTML paragraph) into a typed block."""
    stripped = text.strip()
    if not stripped:
        return None
    if _COMMAND_RE.match(stripped):
        return _block(CommandBlock, text=stripped, confidence=_CONFIRM_HIGH)
    art = _ARTICLE_RE.match(stripped)
    if art and art.group(2) is not None:
        num = (art.group(1) or "").strip()
        suffix = None
        if num and "º" in num:
            m = re.match(r"^(\d+)[ºª]([-A-Z])?$", num)
            if m:
                suffix = m.group(2)
        return _block(ArticleBlock, number=num or None, suffix=suffix,
                      caput=art.group(2).strip(), confidence=_CONFIRM_HIGH)
    if _SOLE_PARAGRAPH_RE.match(stripped):
        return _block(ParagraphItemBlock, number=None, content=stripped,
                      text=stripped, confidence=_CONFIRM_HIGH)
    if _PARAGRAPH_RE.match(stripped):
        para = _PARAGRAPH_RE.match(stripped)
        return _block(ParagraphItemBlock,
                      number=(para.group(1) or "").strip() or None,
                      content=para.group(2).strip() or stripped, text=stripped,
                      confidence=_CONFIRM_HIGH)
    return _block(ParagraphBlock, content=text, confidence=_CONFIRM_HIGH)


# ── Plain-text pass ──────────────────────────────────────────────────────────


def _parse_lines(text: str) -> list:
    blocks: list = []
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        raw = lines[i]
        stripped = raw.strip()
        if not stripped:
            i += 1
            continue

        if _LOCATION_DATE_RE.match(stripped):
            blocks.append(_block(ParagraphBlock, content=stripped,
                                 confidence=_CONFIRM_MED, metadata={"kind": "location_date"}))
            i += 1
            continue

        if _COMMAND_RE.match(stripped):
            blocks.append(_block(CommandBlock, text=stripped,
                                 confidence=_CONFIRM_HIGH))
            i += 1
            continue

        art = _ARTICLE_RE.match(stripped)
        if art and art.group(2) is not None:
            num = (art.group(1) or "").strip()
            suffix = None
            if num and "º" in num:
                m = re.match(r"^(\d+)[ºª]([-A-Z])?$", num)
                if m:
                    suffix = m.group(2)
            caput = art.group(2).strip()
            blocks.append(_block(
                ArticleBlock,
                number=num or None,
                suffix=suffix,
                caput=caput,
                confidence=_CONFIRM_HIGH,
            ))
            i += 1
            # consume following § paragraphs / incisos / alineas that belong to article
            while i < len(lines):
                nxt = lines[i].strip()
                if not nxt:
                    break
                sole = _SOLE_PARAGRAPH_RE.match(nxt)
                para = _PARAGRAPH_RE.match(nxt)
                if sole:
                    blocks[-1].paragraphs.append(_block(
                        ParagraphItemBlock, number=None,
                        content=sole.group(1).strip() or nxt, text=nxt,
                        confidence=_CONFIRM_HIGH))
                    i += 1
                    continue
                if para:
                    blocks[-1].paragraphs.append(_block(
                        ParagraphItemBlock,
                        number=(para.group(1) or "").strip() or None,
                        content=para.group(2).strip() or nxt, text=nxt,
                        confidence=_CONFIRM_HIGH))
                    i += 1
                    continue
                inciso = _INCISO_RE.match(nxt)
                if inciso and inciso.group(1) in _ROMAN and not _ARTICLE_RE.match(nxt):
                    blocks[-1].incisos.append(_block(
                        IncisoBlock, number=inciso.group(1),
                        content=inciso.group(2).strip() or nxt, text=nxt,
                        confidence=_CONFIRM_HIGH))
                    i += 1
                    continue
                alinea = _ALINEA_RE.match(nxt)
                if alinea and len(alinea.group(1)) == 1:
                    blocks[-1].alineas.append(_block(
                        AlineaBlock, number=alinea.group(1),
                        content=alinea.group(2).strip() or nxt, text=nxt,
                        confidence=_CONFIRM_HIGH))
                    i += 1
                    continue
                break
            continue

        if _ALL_CAPS_HEADING_RE.match(stripped) and _looks_like_heading(stripped):
            blocks.append(_block(HeadingBlock, level=2, text=stripped,
                                 confidence=_CONFIRM_MED))
            i += 1
            continue

        if _SOLE_PARAGRAPH_RE.match(stripped):
            blocks.append(_block(ParagraphItemBlock, number=None, text=stripped,
                                 content=stripped, confidence=_CONFIRM_HIGH))
            i += 1
            continue
        if _PARAGRAPH_RE.match(stripped):
            para = _PARAGRAPH_RE.match(stripped)
            blocks.append(_block(ParagraphItemBlock,
                                 number=(para.group(1) or "").strip() or None,
                                 content=para.group(2).strip() or stripped,
                                 text=stripped, confidence=_CONFIRM_HIGH))
            i += 1
            continue
        inciso = _INCISO_RE.match(stripped)
        if inciso and inciso.group(1) in _ROMAN:
            blocks.append(_block(IncisoBlock, number=inciso.group(1),
                                 content=inciso.group(2).strip() or stripped,
                                 text=stripped, confidence=_CONFIRM_HIGH))
            i += 1
            continue
        alinea = _ALINEA_RE.match(stripped)
        if alinea and len(alinea.group(1)) == 1:
            blocks.append(_block(AlineaBlock, number=alinea.group(1),
                                 content=alinea.group(2).strip() or stripped,
                                 text=stripped, confidence=_CONFIRM_HIGH))
            i += 1
            continue

        list_item = _LIST_ITEM_RE.match(stripped)
        if list_item:
            blocks.append(_block(ListBlock, ordered=False,
                                 items=[list_item.group(1).strip()],
                                 confidence=_CONFIRM_MED))
            i += 1
            continue

        if _looks_like_signature(stripped):
            blocks.append(_block(ParagraphBlock, content=stripped,
                                 confidence=_CONFIRM_LOW,
                                 metadata={"kind": "signature"}))
            i += 1
            continue

        blocks.append(_block(ParagraphBlock, content=stripped,
                             confidence=_CONFIRM_HIGH))
        i += 1
    return blocks


_ROMAN = {
    "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
    "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
}


def _looks_like_heading(text: str) -> bool:
    if _SECTION_HEADING_RE.match(text):
        return True
    # short all-caps line, not punctuation-only
    return 3 <= len(text) <= 60


def _looks_like_signature(text: str) -> bool:
    if re.match(r"^(Prefeito|Secret[áa]rio|Diretor|Governador)[\wÀ-ú ]*$", text, re.IGNORECASE):
        return True
    return False


# ── Table builders ───────────────────────────────────────────────────────────


def _build_table_block(rows: list[list[str]]) -> TableBlock:
    headers = rows[0] if rows else []
    body = rows[1:] if rows else []
    table_rows = [
        [TableCell(content=cell, header=False) for cell in row]
        for row in body
    ]
    return _block(
        TableBlock,
        headers=headers,
        rows=table_rows,
        original_data=rows,
        confidence=_CONFIRM_MED,
    )


def _build_table_from_html(table_html: str) -> TableBlock:
    import html as html_mod
    import re

    rows: list[list[TableCell]] = []
    headers: list[str] = []
    original: list[list[str]] = []
    # crude but deterministic: parse rows and cells
    row_iter = re.finditer(r"<tr[^>]*>(.*?)</tr>", table_html, re.DOTALL | re.IGNORECASE)
    for rm in row_iter:
        row_cells: list[TableCell] = []
        row_plain: list[str] = []
        for cm in re.finditer(
            r"<(th|td)([^>]*)>(.*?)</\1>", rm.group(1), re.DOTALL | re.IGNORECASE
        ):
            tag, attrs, inner = cm.group(1), cm.group(2), cm.group(3)
            text = _strip_html_inner(inner)
            rowspan = _int_attr(attrs, "rowspan", 1)
            colspan = _int_attr(attrs, "colspan", 1)
            align = _str_attr(attrs, "align") or _css_attr(attrs, "text-align")
            header = tag.lower() == "th"
            cell = TableCell(
                content=text, rowspan=rowspan, colspan=colspan,
                header=header, align=align,
            )
            if header:
                headers.append(text)
            row_cells.append(cell)
            row_plain.append(text)
        if not row_cells:
            continue
        rows.append(row_cells)
        original.append(row_plain)
    return _block(
        TableBlock,
        headers=headers,
        rows=rows,
        original_data=original,
        confidence=_CONFIRM_MED,
    )


def _int_attr(attrs: str, name: str, default: int) -> int:
    m = re.search(rf'{name}\s*=\s*["\']?(\d+)["\']?', attrs, re.IGNORECASE)
    return int(m.group(1)) if m else default


def _str_attr(attrs: str, name: str) -> str | None:
    m = re.search(rf'{name}\s*=\s*["\']([^"\']+)["\']', attrs, re.IGNORECASE)
    return m.group(1) if m else None


def _css_attr(attrs: str, prop: str) -> str | None:
    m = re.search(rf'{prop}\s*:\s*([^;"\']+)', attrs, re.IGNORECASE)
    return m.group(1).strip() if m else None


def _strip_html_inner(value: str) -> str:
    import html as html_mod

    value = re.sub(r"<[^>]+>", " ", value)
    value = html_mod.unescape(value)
    return re.sub(r"\s+", " ", value).strip()


def _build_list_from_html(list_html: str) -> ListBlock:
    import html as html_mod

    items = []
    for m in re.finditer(r"<li[^>]*>(.*?)</li>", list_html, re.DOTALL | re.IGNORECASE):
        text = _strip_html_inner(m.group(1))
        if text:
            items.append(text)
    ordered = "<ol" in list_html.lower()
    return _block(ListBlock, ordered=ordered, items=items,
                  confidence=_CONFIRM_MED)


# ── Public helpers used by tests ─────────────────────────────────────────────


def build_table_block(rows: list[list[str]]) -> TableBlock:
    return _build_table_block(rows)
