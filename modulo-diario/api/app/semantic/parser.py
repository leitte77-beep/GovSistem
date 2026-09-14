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
    CLASSIFICATION_PENDING,
    ORIGIN_DETERMINISTIC,
    AlineaBlock,
    ArticleBlock,
    CommandBlock,
    ConsiderandoBlock,
    HeadingBlock,
    ImageBlock,
    IncisoBlock,
    ListBlock,
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
    r"^(DECRETA|RESOLVE|SANCIONA|TORNA\s+P[UÚ]BLICO|EXPEDE|"
    r"RESOLVE\s*[:.]|DETERMINA|DESIGNA|CONVOCA|INSTITUI|REVOGA)[:.\s]*$",
    re.IGNORECASE,
)
# CONSIDERANDO is a recital, not the enacting formula. Match a heading form
# ('CONSIDERANDO:') and the inline form ('Considerando que ...').
_CONSIDERANDO_RE = re.compile(r"^\s*CONSIDERANDO\b\s*:?\s*", re.IGNORECASE)
# 'SÚMULA:' / 'EMENTA:' label preserved exactly as authored.
_SUMMARY_LABEL_RE = re.compile(
    r"^\s*(S[UÚ]MULA|EMENTA)\s*[:\-–]\s*(.*)$", re.IGNORECASE | re.DOTALL
)
_PREAMBLE_RE = re.compile(
    r"NO\s+USO\s+DE\s+SUAS\s+ATRIBUI[ÇC][ÕO]ES|"
    r"^(O|A)\s+(PREFEITO|PREFEITA|GOVERNADOR|GOVERNADORA|PRESIDENTE|"
    r"SECRET[ÁA]RIO|SECRET[ÁA]RIA|DIRETOR|DIRETORA|REITOR|REITORA)\b",
    re.IGNORECASE,
)
_ARTICLE_RE = re.compile(
    r"^Art\.?\s*([0-9IVXLCDM]+[ºªo\-A-Z0-9]*)?\s*(?:[:.-]\s*)?(.*)$",
    re.IGNORECASE,
)
_SOLE_PARAGRAPH_RE = re.compile(r"^P[AÁ]R[AÁ]GRAFO\s*[UÚ]NICO[:.\s]*(.*)$", re.IGNORECASE)
_PARAGRAPH_RE = re.compile(r"^§\s*([0-9ºª]*)\.?\s*(.*)$")
_INCISO_RE = re.compile(r"^\s*([IVXLCDM]+)\s*[-–:)\s]+(.*)$")
_ALINEA_RE = re.compile(r"^\s*([a-z]{1,2})\s*\)\s*(.*)$")
_ITEM_RE = re.compile(r"^\s*([0-9]+)\s*\)\s*(.*)$")
_LIST_ITEM_RE = re.compile(r"^\s*[-•*]\s+(.*)$")
_ROLE_RE = re.compile(
    r"^(PREFEIT[OA]|VICE-?PREFEIT[OA]|SECRET[ÁA]RI[OA]|SUBSECRET[ÁA]RI[OA]|"
    r"DIRETOR(A)?|PRESIDENTE|VICE-?PRESIDENTE|GOVERNADOR(A)?|VICE-?GOVERNADOR(A)?|"
    r"REITOR(A)?|VICE-?REITOR(A)?|PROCURADOR(A)?|PROCURADOR[A]?-GERAL|"
    r"CONTROLADOR(A)?|CHEFE|COORDENADOR(A)?|SUPERINTENDENTE|GERENTE|"
    r"ASSESSOR(A)?|TITULAR|RESPONS[ÁA]VEL|ORDENADOR(A)?|GESTOR(A)?|"
    r"MINISTR[OA]|DEPUTAD[OA]|VEREADOR(A)?|PRESIDENTE\s+DA\s+C[ÂA]MARA)"
    r"\b",
    re.IGNORECASE,
)
_LOCATION_HINT_RE = re.compile(
    r"(PA[ÇC]O|PAL[ÁA]CIO|PREFEITURA|C[ÂA]MARA|MUNIC[ÍI]PIO|GABINETE|"
    r"\bDE\s+\d{4}\b|\b\d{4}\b)",
    re.IGNORECASE,
)
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
    r"^(?P<city>[A-ZÀ-Ú][\wÀ-ú .\"]{2,}),\s+(?P<day>\d{1,2})\s+DE\s+"
    r"(?P<month>JANEIRO|FEVEREIRO|MAR[ÇC]O|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|"
    r"SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s+DE\s+(?P<year>\d{4})\s*[.]?\s*$",
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


def extract_summary(text: str) -> tuple[str, Optional[str], str]:
    """Pull an explicit SÚMULA:/EMENTA: out of the body, preserving the label.

    Returns ``(body_without_summary, label, summary_text)``. The label is
    returned exactly as authored (e.g. ``"SÚMULA"``, ``"Ementa"``) and the body
    is returned without the extracted paragraph so the summary is rendered in
    its canonical position (right below the act title) and never duplicated.
    Works on paragraph boundaries to be safe with multi-line text.
    """
    if not text:
        return text, None, ""
    paragraphs = re.split(r"\n\s*\n", text)
    for idx, paragraph in enumerate(paragraphs):
        match = _SUMMARY_LABEL_RE.match(paragraph.strip())
        if not match:
            continue
        label = match.group(1).strip()
        content = match.group(2).strip()
        rest = paragraphs[idx + 1:]
        if not content and rest:
            content = rest[0].strip()
            rest = rest[1:]
        body = "\n\n".join(paragraphs[:idx] + rest)
        return body, label, content
    # Fallback: the label sits on its own line with only a single line break
    # before the surrounding text (common in pasted/PDF text, where the blank
    # line was lost). Preserve order and drop only the label line.
    lines = text.split("\n")
    for idx, line in enumerate(lines):
        match = _SUMMARY_LABEL_RE.match(line.strip())
        if not match:
            continue
        label = match.group(1).strip()
        content = match.group(2).strip()
        if not content and idx + 1 < len(lines):
            content = lines[idx + 1].strip()
            rest_lines = lines[:idx] + lines[idx + 2:]
        else:
            rest_lines = lines[:idx] + lines[idx + 1:]
        return "\n".join(rest_lines), label, content
    return text, None, ""


def _strip_html_text(value: str) -> str:
    from .schemas import _strip_html

    return _strip_html(value or "")


def _drop_summary_block(blocks: list, label: str) -> list:
    """Remove the body block that held the SÚMULA/EMENTA (now a field)."""
    prefix = (label or "").strip().lower() + ":"
    for idx, block in enumerate(blocks):
        btype = getattr(block, "type", "")
        if btype in ("paragraph", "preamble", "considerando", "command"):
            candidate = _strip_html_text(
                getattr(block, "content", None) or getattr(block, "text", "")
            )
            if candidate.lstrip().lower().startswith(prefix):
                del blocks[idx]
                return blocks
    return blocks


def _block_text(block) -> str:
    btype = getattr(block, "type", "")
    if btype in ("paragraph", "preamble", "considerando", "quote", "legacy_html"):
        return _strip_html_text(getattr(block, "content", ""))
    if btype in ("heading", "command"):
        return getattr(block, "text", "") or ""
    return ""


_SIGNATURE_CONSUMABLE = {"paragraph", "preamble", "considerando", "command", "heading"}


def _merge_trailing_signature(blocks: list) -> list:
    """Fold a trailing name + role (+ location/date) into a signature block.

    This is a heuristic, so the resulting block keeps the *lowest* confidence of
    its parts and stays flagged for human confirmation. No text is dropped:
    the location/date text is carried into the signature entry and is included
    in ``plain_text()`` for integrity checks.
    """
    if len(blocks) < 2:
        return blocks
    last = blocks[-1]
    if getattr(last, "type", "") not in _SIGNATURE_CONSUMABLE:
        return blocks
    role = _block_text(last).strip()
    if not role or not _ROLE_RE.match(role):
        return blocks

    name_block = blocks[-2]
    if getattr(name_block, "type", "") not in _SIGNATURE_CONSUMABLE:
        return blocks
    name = _block_text(name_block).strip()
    words = name.split()
    if not name or len(words) > 8 or _ROLE_RE.match(name):
        return blocks

    consumed = [name_block, last]
    start = len(blocks) - 2

    location = ""
    if start - 1 >= 0 and getattr(blocks[start - 1], "type", "") in _SIGNATURE_CONSUMABLE:
        prev = _block_text(blocks[start - 1]).strip()
        prev_meta = getattr(blocks[start - 1], "metadata", {}) or {}
        if (
            prev_meta.get("kind") == "location_date"
            or _LOCATION_DATE_RE.match(prev)
            or _LOCATION_HINT_RE.search(prev)
        ):
            location = prev
            consumed.insert(0, blocks[start - 1])
            start -= 1

    confidence = min(getattr(b, "confidence", 1.0) for b in consumed)
    entry = SignatureEntry(name=name, role=role, location=location, date="")
    signature = _block(
        SignatureBlock, entries=[entry], alignment="center", confidence=confidence
    )
    return blocks[:start] + [signature]


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

    # Detect an explicit SÚMULA:/EMENTA: label in the pasted body and preserve
    # it exactly. The body no longer contains the summary paragraph.
    body_text, found_label, found_summary = extract_summary(text)
    summary_label = found_label
    if not summary and found_summary:
        summary = found_summary

    blocks = []
    if norm["html"]:
        blocks = _parse_html(norm["html"], fallback_text=text)
        if found_label:
            blocks = _drop_summary_block(blocks, found_label)
        text_for_parse = ""
    else:
        # Plain text (with or without tab-separated table rows). Tabs are
        # preserved by the normalizer, so a spreadsheet paste is reconstructed
        # as a real table inside the same document as the surrounding text.
        text_for_parse = body_text

    if not blocks and text_for_parse.strip():
        blocks = _parse_lines(text_for_parse)

    if title and not blocks:
        blocks.append(_block(HeadingBlock, level=1, text=title))

    doc = SemanticDocument(
        document_type=document_type,
        title=title,
        summary=summary,
        summary_label=summary_label,
        source_type=source_type,
        blocks=blocks,
        classification_status=CLASSIFICATION_PENDING,
    )

    # Integrity
    if norm["html"]:

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
    from html.parser import HTMLParser

    top_level = {
        "p", "div", "section", "h1", "h2", "h3", "h4", "h5", "h6",
        "ul", "ol", "blockquote", "img", "hr", "table",
    }

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
                if tag in top_level:
                    self._stack.append((tag, True))
                    self._buf = []
                    self._raw = []
                    self._raw.append(self._tag_html())
                else:
                    tag_html = self.get_starttag_text()
                    self.top.append({"kind": "text", "inner": tag_html, "raw": tag_html})
            else:
                self._stack.append((tag, False))
                self._raw.append(self._tag_html())

        def handle_startendtag(self, tag, attrs):
            if not self._stack and tag == "img":
                tag_html = self.get_starttag_text()
                self.top.append({"kind": "img", "inner": tag_html, "raw": tag_html})

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
    return _merge_trailing_signature(blocks)


def _inner_text(html: str) -> str:
    from app.semantic.schemas import _strip_html

    return _strip_html(html)


def _classify_text_line(text: str, blocks: list) -> Optional[object]:
    """Classify a single line (from HTML paragraph) into a typed block."""
    stripped = text.strip()
    if not stripped:
        return None
    if _CONSIDERANDO_RE.match(stripped):
        return _block(ConsiderandoBlock, content=text, confidence=_CONFIRM_HIGH)
    if _PREAMBLE_RE.search(stripped) and len(stripped.split()) >= 6:
        return _block(PreambleBlock, content=text, confidence=_CONFIRM_MED)
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

        if _is_tab_row(stripped):
            rows: list[list[str]] = []
            while i < len(lines) and _is_tab_row(lines[i].strip()):
                rows.append([cell.strip() for cell in lines[i].strip().split("\t")])
                i += 1
            blocks.append(_build_table_block(rows))
            continue

        if _LOCATION_DATE_RE.match(stripped):
            blocks.append(_block(ParagraphBlock, content=stripped,
                                 confidence=_CONFIRM_MED, metadata={"kind": "location_date"}))
            i += 1
            continue

        if _CONSIDERANDO_RE.match(stripped):
            blocks.append(_block(ConsiderandoBlock, content=stripped,
                                 confidence=_CONFIRM_HIGH))
            i += 1
            continue

        if _PREAMBLE_RE.search(stripped) and len(stripped.split()) >= 6:
            blocks.append(_block(PreambleBlock, content=stripped,
                                 confidence=_CONFIRM_MED))
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
                if alinea and len(alinea.group(1)) <= 2:
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
    return _merge_trailing_signature(blocks)


def _roman_numeral(value: int) -> str:
    numerals = (
        (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
        (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
    )
    out = []
    for amount, symbol in numerals:
        while value >= amount:
            out.append(symbol)
            value -= amount
    return "".join(out)


_ROMAN = {_roman_numeral(i) for i in range(1, 101)}


def _looks_like_heading(text: str) -> bool:
    if _SECTION_HEADING_RE.match(text):
        return True
    # short all-caps line, not punctuation-only
    return 3 <= len(text) <= 60


def _looks_like_signature(text: str) -> bool:
    return bool(_ROLE_RE.match(text))


# ── Table builders ───────────────────────────────────────────────────────────


_NUMERIC_CELL_RE = re.compile(r"^[R$\s]*[-+]?\d[\d.,\s/%()ºª°-]*$")


def _is_tab_row(line: str) -> bool:
    if "\t" not in line:
        return False
    return len([cell for cell in line.split("\t") if cell.strip()]) >= 2


def _cell_is_numeric(value: str) -> bool:
    value = (value or "").strip()
    if not value:
        return False
    return bool(_NUMERIC_CELL_RE.match(value))


def _looks_like_header_row(first: list[str], rest: list[list[str]]) -> bool:
    """A first row is a header only when it reads like labels, not data."""
    if not first:
        return False
    cells = [str(c).strip() for c in first]
    non_empty = [c for c in cells if c]
    if not non_empty:
        return False
    if any(_cell_is_numeric(c) for c in non_empty):
        return False
    return any(re.search(r"[A-Za-zÀ-ÿ]", c) for c in non_empty)


def _compute_column_widths(
    rows: list[list[str]], min_pct: float = 4.0, max_pct: float = 45.0
) -> list[float]:
    """Relative column widths from the longest content per column.

    Returns percentages that sum to 100 so the PDF can emit a ``<colgroup>``
    and stop blind equal-width columns from shredding numbers and words.
    """
    if not rows:
        return []
    ncols = max((len(r) for r in rows), default=0)
    if ncols == 0:
        return []
    weights: list[float] = []
    for col in range(ncols):
        longest = 0
        numeric_col = True
        for row in rows:
            value = str(row[col]).strip() if col < len(row) else ""
            longest = max(longest, len(value))
            if value and not _cell_is_numeric(value):
                numeric_col = False
        weight = max(float(longest), min_pct)
        if numeric_col and longest <= 12:
            weight = min(weight, 12.0)
        weights.append(weight)
    total = sum(weights) or 1.0
    pcts = [w / total * 100.0 for w in weights]
    pcts = [min(max(p, min_pct), max_pct) for p in pcts]
    total2 = sum(pcts) or 1.0
    return [round(p / total2 * 100.0, 2) for p in pcts]


def _build_table_block(rows: list[list[str]]) -> TableBlock:
    rows = [list(r) for r in rows if any((c or "").strip() for c in r)]
    if not rows:
        return _block(TableBlock, confidence=_CONFIRM_MED)
    has_header = _looks_like_header_row(rows[0], rows[1:])
    headers = [str(c).strip() for c in rows[0]] if has_header else []
    body_rows = rows[1:] if has_header else rows
    table_rows = [
        [TableCell(content=str(cell).strip(), header=False) for cell in row]
        for row in body_rows
    ]
    return _block(
        TableBlock,
        headers=headers,
        rows=table_rows,
        column_widths=_compute_column_widths(rows),
        original_data=rows,
        confidence=_CONFIRM_MED,
    )


class _TableHTMLParser:
    """Robust table extractor (thead/tbody/th/td, colspan, rowspan, <br>)."""

    def __init__(self) -> None:
        from html.parser import HTMLParser

        parser_self = self

        class _Parser(HTMLParser):
            def __init__(self) -> None:
                super().__init__(convert_charrefs=True)
                self.rows: list[list[dict]] = []
                self.has_th = False
                self._depth = 0
                self._row: Optional[list[dict]] = None
                self._cell: Optional[dict] = None
                self._buf: list[str] = []

            def handle_starttag(self, tag, attrs):
                t = tag.lower()
                if t == "table":
                    self._depth += 1
                    return
                if self._depth != 1:
                    return
                if t == "tr":
                    self._row = []
                elif t in ("td", "th"):
                    if self._row is None:
                        self._row = []
                    attrs_d = {k.lower(): (v or "") for k, v in attrs}
                    self._cell = {
                        "text": "",
                        "colspan": _int_attr_str(attrs_d.get("colspan"), 1),
                        "rowspan": _int_attr_str(attrs_d.get("rowspan"), 1),
                        "header": t == "th",
                        "align": attrs_d.get("align")
                        or _css_attr(attrs_d.get("style", ""), "text-align") or "",
                    }
                    self._buf = []
                    if t == "th":
                        self.has_th = True
                elif t == "br" and self._cell is not None:
                    self._buf.append("\n")

            def handle_data(self, data):
                if self._cell is not None:
                    self._buf.append(data)

            def handle_endtag(self, tag):
                t = tag.lower()
                if t == "table":
                    self._depth = max(0, self._depth - 1)
                    return
                if self._depth != 1:
                    return
                if t in ("td", "th") and self._cell is not None:
                    self._cell["text"] = re.sub(
                        r"[ \t]+", " ", "".join(self._buf)
                    ).strip()
                    if self._row is not None:
                        self._row.append(self._cell)
                    self._cell = None
                    self._buf = []
                elif t == "tr" and self._row is not None:
                    if self._row:
                        self.rows.append(self._row)
                    self._row = None

        parser_self._parser = _Parser()


# ``_TableHTMLParser`` is a thin wrapper so existing call sites stay simple.
def _parse_table_rows(table_html: str) -> tuple[list[list[dict]], bool]:
    wrapper = _TableHTMLParser()
    p = wrapper._parser
    try:
        p.feed(table_html or "")
        p.close()
    except Exception:  # noqa: BLE001 - never crash on malformed HTML
        return [], False
    return p.rows, p.has_th


def _build_table_from_html(table_html: str) -> TableBlock:
    rows_html, has_th = _parse_table_rows(table_html)
    if not rows_html:
        return _block(TableBlock, confidence=_CONFIRM_MED)

    headers: list[str] = []
    if has_th:
        idx = 0
        while idx < len(rows_html) and any(c["header"] for c in rows_html[idx]):
            headers.extend(c["text"] for c in rows_html[idx] if c["header"])
            idx += 1

    # Keep every row (including header rows) so colspan/rowspan structure and
    # text integrity are preserved; the renderer lifts header rows into <thead>.
    rows: list[list[TableCell]] = []
    original: list[list[str]] = []
    for row in rows_html:
        cells = [
            TableCell(
                content=c["text"],
                colspan=c["colspan"],
                rowspan=c["rowspan"],
                header=c["header"],
                align=c["align"] or None,
            )
            for c in row
        ]
        rows.append(cells)
        original.append([c["text"] for c in row])

    plain_rows = [[c["text"] for c in row] for row in rows_html]
    return _block(
        TableBlock,
        headers=headers,
        rows=rows,
        column_widths=_compute_column_widths(plain_rows),
        original_data=original,
        confidence=_CONFIRM_MED,
    )


def _int_attr(attrs: str, name: str, default: int) -> int:
    m = re.search(rf'{name}\s*=\s*["\']?(\d+)["\']?', attrs, re.IGNORECASE)
    return int(m.group(1)) if m else default


def _int_attr_str(value: Optional[str], default: int) -> int:
    if not value:
        return default
    m = re.search(r"(\d+)", str(value))
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
