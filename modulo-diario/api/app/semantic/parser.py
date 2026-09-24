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
from html import unescape as _html_unescape
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
    r"^(DECRETA|RESOLVE|SANCIONA|SANCIONO|PROMULGA|PROMULGO|BAIXA|"
    r"TORNA\s+P[UÚ]BLICO|FAZ\s+SABER|EXPEDE|"
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
    r"MINISTR[OA]|DEPUTAD[OA]|VEREADOR(A)?|PRESIDENTE\s+DA\s+C[ÂA]MARA|"
    r"CONTRATANTE|CONTRATAD[OA]|CONTRATADA|TESTEMUNHA|REPRESENTANTE|"
    r"INTERVENIENTE|LOCADOR(A)?|LOCAT[ÁA]RI[OA]|OUTORGANTE|OUTORGAD[OA]|"
    r"GESTOR[A]?|FISCAL)"
    r"\b",
    re.IGNORECASE,
)
# A compact 'Label: value' field (contracts/extracts), e.g. 'Objeto: ...'.
_FIELD_RE = re.compile(
    r"^\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9ºª°./()\s\-]{1,40}:\s+\S"
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
    """Fold trailing name + role pairs (+ location/date) into a signature block.

    Supports multiple signatories (e.g. contratante/contratada, two secretaries)
    by walking backwards over consecutive (name, role) pairs. This is a
    heuristic, so the resulting block keeps the *lowest* confidence of its parts
    and stays flagged for human confirmation. No text is dropped: the
    location/date text is carried into the first entry and is included in
    ``plain_text()`` for integrity checks.
    """
    if len(blocks) < 2:
        return blocks

    entries: list[SignatureEntry] = []
    idx = len(blocks) - 1
    while idx >= 1:
        role_block = blocks[idx]
        role = _block_text(role_block).strip()
        if (
            getattr(role_block, "type", "") not in _SIGNATURE_CONSUMABLE
            or not role
            or not _ROLE_RE.match(role)
        ):
            break
        name_block = blocks[idx - 1]
        name = _block_text(name_block).strip()
        words = name.split()
        if (
            getattr(name_block, "type", "") not in _SIGNATURE_CONSUMABLE
            or not name
            or len(words) > 8
            or _ROLE_RE.match(name)
        ):
            break
        entries.insert(0, SignatureEntry(name=name, role=role, location="", date=""))
        idx -= 2

    if not entries:
        return blocks

    start = len(blocks) - 2 * len(entries)
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
            start -= 1
    if location:
        entries[0].location = location

    confidence = min(getattr(b, "confidence", 1.0) for b in blocks[start:])
    signature = _block(
        SignatureBlock, entries=entries, alignment="center", confidence=confidence
    )
    return blocks[:start] + [signature]


_SUMMARY_ANY_LABEL_RE = re.compile(r"^\s*(S[UÚ]MULA|EMENTA)\s*[:\-–]\s*", re.IGNORECASE)


def _block_plain_text(block) -> str:
    """Plain text for any block type (used by structural comparisons)."""
    btype = getattr(block, "type", "")
    if btype in ("heading", "command"):
        return getattr(block, "text", "") or ""
    if btype == "article":
        return getattr(block, "caput", "") or ""
    if btype == "signature_block":
        return " ".join(
            f"{e.name} {e.role} {e.location} {e.date}" for e in block.entries
        )
    return _strip_html_text(getattr(block, "content", "") or "")


def _norm_key(value: str) -> str:
    value = _strip_html_text(value or "").lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _similar(a: str, b: str) -> bool:
    """Token-set similarity, tolerant of labels/punctuation variations."""
    if not a or not b:
        return False
    if a == b:
        return True
    if a in b or b in a:
        # Containment alone is not enough: a short generic title ("PORTARIA",
        # "DECRETO") is contained in many legitimate body lines ("II - Esta
        # Portaria entra em vigor...") and dropping those would delete legal
        # content. Only treat containment as a duplicate when the two texts
        # have comparable length — i.e. one really is the other plus a label.
        shorter, longer = min(len(a), len(b)), max(len(a), len(b))
        return shorter >= 8 and shorter / longer >= 0.6
    ta, tb = set(a.split()), set(b.split())
    inter = len(ta & tb)
    return inter > 0 and inter / len(ta | tb) >= 0.7


def _strip_summary_label(text: str) -> str:
    return _SUMMARY_ANY_LABEL_RE.sub("", (text or "").strip())


def _dedupe_structured(blocks: list, *, title: str = "", summary: str = ""):
    """Drop body blocks that repeat the structured title/summary fields.

    The form fields are the single source of truth for the heading/summary, so
    a pasted Word/HTML header or 'SÚMULA: ...' line must not be duplicated in
    the body. Similarity (not bare equality) covers 'SÚMULA: X' vs 'X'.
    Returns ``(blocks, adjustments)`` and never mutates text silently — every
    removal is reported in ``adjustments``.
    """
    adjustments: list[dict] = []
    title_key = _norm_key(title)
    summary_key = _norm_key(summary)
    kept: list = []
    for block in blocks:
        btype = getattr(block, "type", "")
        if btype in ("signature_block", "table", "image", "page_break"):
            kept.append(block)
            continue
        raw = _block_plain_text(block)
        key = _norm_key(raw)
        if not key:
            kept.append(block)
            continue
        if title_key and _similar(key, title_key):
            adjustments.append({
                "action": "removed_duplicate_title",
                "block_type": btype,
                "text": _strip_html_text(raw)[:160],
            })
            continue
        if summary_key:
            core = _norm_key(_strip_summary_label(raw))
            if core and _similar(core, summary_key):
                adjustments.append({
                    "action": "removed_duplicate_summary",
                    "block_type": btype,
                    "text": _strip_html_text(raw)[:160],
                })
                continue
        kept.append(block)
    return kept, adjustments


def _is_location_like(block, text: str) -> bool:
    meta = getattr(block, "metadata", {}) or {}
    if meta.get("kind") == "location_date":
        return True
    if len(text) > 160:
        return False
    if _LOCATION_DATE_RE.match(text):
        return True
    return bool(_LOCATION_HINT_RE.search(text))


def _normalize_closing(blocks: list):
    """Make the closing an atomic unit, always before the signature.

    Collects contiguous location/date/place blocks sitting immediately before
    the signature block, folds them into the signature's first entry and emits
    a single fecho (place + date) rendered right before the name/role. The
    signature is forced to be the last block. Returns ``(blocks, adjustments)``.
    """
    adjustments: list[dict] = []
    sig = next(
        (b for b in reversed(blocks) if getattr(b, "type", "") == "signature_block"),
        None,
    )
    if sig is None or not sig.entries:
        return blocks, adjustments

    idx = blocks.index(sig)
    collected: list = []
    j = idx - 1
    while j >= 0:
        block = blocks[j]
        text = _block_plain_text(block).strip()
        if not text:
            j -= 1
            continue
        if (
            getattr(block, "type", "") in ("paragraph", "heading", "quote", "legacy_html")
            and _is_location_like(block, text)
        ):
            collected.insert(0, block)
            j -= 1
            continue
        break

    entry = sig.entries[0]
    if collected:
        parts = [_strip_html_text(_block_plain_text(b)) for b in collected]
        if entry.location:
            parts.append(entry.location)
        if entry.date:
            parts.append(entry.date)
        entry.location = "\n".join(p for p in parts if p.strip())
        entry.date = ""
        for block in collected:
            blocks.remove(block)
        adjustments.append({
            "action": "merged_closing",
            "text": entry.location[:200].replace("\n", " / "),
        })

    if blocks and blocks[-1] is not sig:
        adjustments.append({"action": "moved_signature_to_end"})
    return [b for b in blocks if b is not sig] + [sig], adjustments


def _block(btype, **kw):
    """Factory that forces deterministic origin + a base confidence.

    A block classified with high confidence is auto-confirmed so a standard
    act (paste → publish) never stalls waiting on a human to tick every
    paragraph. Only genuinely ambiguous blocks (tables, freeform lists,
    heuristic signature merges — anything below ``_CONFIRM_HIGH``) still
    require explicit human confirmation before approval.
    """
    kw.setdefault("id", stable_id())
    kw.setdefault("origin", ORIGIN_DETERMINISTIC)
    kw.setdefault("confirmed", kw.get("confidence", 1.0) >= _CONFIRM_HIGH)
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

    # Deterministic structuring: keep a single source of truth for the heading
    # (structured field) and make the closing (place + date) an atomic block
    # that always precedes the signature. Every change is reported, never
    # silent.
    blocks, dedupe_adjustments = _dedupe_structured(
        blocks, title=title, summary=summary
    )
    blocks, closing_adjustments = _normalize_closing(blocks)
    auto_adjustments = dedupe_adjustments + closing_adjustments

    doc = SemanticDocument(
        document_type=document_type,
        title=title,
        summary=summary,
        summary_label=summary_label,
        source_type=source_type,
        blocks=blocks,
        classification_status=CLASSIFICATION_PENDING,
        auto_adjustments=auto_adjustments,
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


_BR_SPLIT_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)
_SENTENCE_END_RE = re.compile(r'[.:;]["”\']?\s*$')


def _split_by_br(raw_html: str) -> list[str]:
    """Split a raw HTML chunk on <br> into candidate logical lines.

    Not every real-world source produces one <p> per line: text typed with
    Shift+Enter, or plain multi-line text the browser wraps into a single
    paragraph on paste, arrives as ONE paragraph with <br> as the only line
    separator. Without this, the whole act (preamble through signature) gets
    classified as a single line — usually swallowed whole into one preamble
    block — instead of one block per Art./§/inciso/assinatura. The raw split
    is over-eager (it also cuts a sentence that merely wraps for
    readability), so callers must run it through ``_regroup_br_segments``.
    """
    if not raw_html or not _BR_SPLIT_RE.search(raw_html):
        return [raw_html]
    return _BR_SPLIT_RE.split(raw_html)


def _starts_new_unit(stripped: str) -> bool:
    """True when a line of text opens a new structural unit.

    Used to tell a genuine line break (new Art./§/inciso/command/heading/
    signature/location+date) apart from a <br> that only wraps one sentence
    for on-screen readability.
    """
    if not stripped:
        return True
    if _COMMAND_RE.match(stripped) or _CONSIDERANDO_RE.match(stripped):
        return True
    art = _ARTICLE_RE.match(stripped)
    if art and art.group(2) is not None:
        return True
    if _SOLE_PARAGRAPH_RE.match(stripped) or _PARAGRAPH_RE.match(stripped):
        return True
    inciso = _INCISO_RE.match(stripped)
    if inciso and inciso.group(1) in _ROMAN:
        return True
    alinea = _ALINEA_RE.match(stripped)
    if alinea and len(alinea.group(1)) <= 2:
        return True
    if _LIST_ITEM_RE.match(stripped) or _LOCATION_DATE_RE.match(stripped):
        return True
    if _ROLE_RE.match(stripped) or _FIELD_RE.match(stripped):
        return True
    if _is_tab_row(stripped):
        return True
    # Deliberately NOT using the ALL-CAPS-heading heuristic here: a short
    # all-caps trailing fragment (e.g. "SERVIDORES PÚBLICOS,") is often just
    # the tail of a preamble/considerando sentence, not a real heading — and
    # a false positive here would wrongly cut a legal sentence in half.
    return False


def _regroup_lines(lines: list[str]) -> list[str]:
    """Merge consecutive plain-text lines that are one sentence wrapped.

    Some sources (Office/PDF clipboard payloads especially) hand over the
    whole act as literal newline-separated text with no paragraph markup at
    all, so a single sentence that merely wraps for on-screen width would
    otherwise become one block per line. Mirrors ``_regroup_br_segments``.
    """
    if len(lines) <= 1:
        return lines
    merged: list[str] = []
    buf: Optional[str] = None
    buf_stripped = ""
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if buf is not None:
                merged.append(buf)
                buf = None
                buf_stripped = ""
            merged.append(line)
            continue
        if (
            buf is None
            or _SENTENCE_END_RE.search(buf_stripped)
            or _starts_new_unit(stripped)
            or _is_tab_row(buf_stripped)
        ):
            if buf is not None:
                merged.append(buf)
            buf = line
            buf_stripped = stripped
        else:
            buf = f"{buf.rstrip()} {stripped}"
            buf_stripped = f"{buf_stripped} {stripped}"
    if buf is not None:
        merged.append(buf)
    return merged


def _regroup_br_segments(segments: list[str]) -> list[str]:
    """Merge <br>-split fragments that are just a soft-wrap of one sentence.

    A <br> only starts a new logical line when the fragment after it opens a
    recognizable structural unit (see ``_starts_new_unit``) or the fragment
    before it already ended a sentence/clause ('.', ':', ';'). Otherwise the
    two fragments are the same sentence wrapped for readability and must
    stay in a single block — merging keeps rich (HTML) content intact.
    """
    if len(segments) <= 1:
        return segments
    merged: list[str] = []
    buf = segments[0]
    buf_plain = _inner_text(buf).strip()
    for seg in segments[1:]:
        seg_plain = _inner_text(seg).strip()
        if not seg_plain:
            continue
        if not buf_plain or _SENTENCE_END_RE.search(buf_plain) or _starts_new_unit(seg_plain):
            merged.append(buf)
            buf = seg
            buf_plain = seg_plain
        else:
            buf = buf.rstrip() + " " + seg.lstrip()
            buf_plain = f"{buf_plain} {seg_plain}"
    merged.append(buf)
    return merged


def _parse_html(html: str, fallback_text: str = "") -> list:
    """Best-effort HTML parse producing blocks; falls back to line parsing."""
    tokens = _split_html_blocks(html)
    blocks: list = []
    for tok in tokens:
        kind = tok["kind"]
        raw = tok.get("raw") or tok.get("inner") or ""
        if kind == "table":
            blocks.append(_preserved_table_block(raw) or _build_table_from_html(raw))
        elif kind in ("p", "div", "section"):
            # ``raw`` keeps nested inline tags (bold/italic); ``inner`` is the
            # already-stripped text used for classification. A <br>-joined
            # paragraph is split into one segment per line first (see
            # _split_by_br) so each line is classified on its own.
            raw_html = tok.get("raw") or tok.get("inner", "")
            for segment in _regroup_br_segments(_split_by_br(raw_html)):
                inner = _inner_text(segment)
                rich = _inline_html(segment)
                classified = _classify_text_line(inner, blocks, rich=rich)
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
                                 content=_inline_html(tok.get("inner", "")),
                                 confidence=_CONFIRM_MED))
        elif kind == "img":
            blocks.append(_block(ImageBlock, src=raw, alt="", confidence=_CONFIRM_MED))
    if not blocks and fallback_text.strip():
        blocks = _parse_lines(fallback_text)
    return _merge_trailing_signature(blocks)


def _inner_text(html: str) -> str:
    from app.semantic.schemas import _strip_html

    return _strip_html(html)


_INLINE_KEEP = "strong|b|em|i|u|s|sub|sup|a|br|span|code|del|ins|cite|abbr|mark"
_INLINE_UNWRAP_RE = re.compile(
    r"</?(?:p|div|section|article|header|footer|main|aside|li|ul|ol|dl|dt|dd|"
    r"h[1-6]|blockquote|pre|figure|figcaption|table|thead|tbody|tfoot|tr|td|th|"
    r"caption|colgroup|col|hr)\b[^>]*>",
    re.IGNORECASE,
)


def _inline_html(html: str) -> str:
    """Sanitize pasted HTML but KEEP intentional inline formatting.

    Bold/italic that the author applied (Word or editor) must survive the
    pipeline; only block wrappers and presentation attributes (Word classes,
    inline styles) are removed. Executable markup is stripped by the shared
    sanitizer first, so this never weakens security.
    """
    from app.core.html_sanitizer import sanitize_html

    if not html:
        return ""
    safe = sanitize_html(html)
    # Unwrap block-level wrappers, keeping their children/text.
    safe = _INLINE_UNWRAP_RE.sub("", safe)

    def _strip_attrs(match: "re.Match[str]") -> str:
        tag = match.group(1).lower()
        if tag not in _INLINE_KEEP.split("|"):
            return ""  # unknown inline tag: drop the tag (keep inner text)
        if tag == "a":
            href = re.search(r'href\s*=\s*(["\'])(.*?)\1', match.group(0), re.I)
            if href:
                return f'<a href="{href.group(2)}">'
        if tag == "br":
            return "<br/>"
        return f"<{tag}>"

    safe = re.sub(r"<([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?/?>", _strip_attrs, safe)
    return re.sub(r"\s+", " ", safe).strip()


_RICH_ENTITY_RE = re.compile(r"&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);")


def _rich_char_norm(ch: str) -> str:
    """Normalize one character for prefix matching across HTML/plain text."""
    if ch.isspace() or ch == "\xa0":
        return " "
    if ch in "-‐‑‒–—−":
        return "-"
    return ch


def _strip_rich_prefix(rich: str, prefix: str) -> str:
    """Remove a leading numbering prefix from inline HTML, keeping formatting.

    The prefix comes from the PLAIN text of the line ("I – "), while the HTML
    frequently splits it across tags — Word/LibreOffice pastes produce
    ``I <span ...>– Conceder férias ao servidor <strong>FULANO</strong>…``.
    A literal ``startswith`` therefore fails on exactly the paragraphs that
    carry the bold names/positions, and the caller would fall back to plain
    text, silently dropping the author's bold/italic. So walk the HTML,
    copying tags through and consuming only the prefix's characters, tolerant
    of entities (``&nbsp;``), whitespace runs and hyphen/dash variants.
    """
    if not rich:
        return rich
    if not prefix or not prefix.strip():
        return rich.strip()

    wanted = [_rich_char_norm(c) for c in prefix.strip()]
    out: list[str] = []
    i = 0
    w = 0
    n = len(rich)
    while i < n and w < len(wanted):
        ch = rich[i]
        if ch == "<":  # a tag is formatting, never part of the prefix
            end = rich.find(">", i)
            if end == -1:
                return ""
            out.append(rich[i:end + 1])
            i = end + 1
            continue
        raw, plain = ch, ch
        if ch == "&":
            match = _RICH_ENTITY_RE.match(rich, i)
            if match:
                raw = match.group(0)
                plain = _html_unescape(raw)
        norm = _rich_char_norm(plain if len(plain) == 1 else plain[:1])
        if norm == wanted[w]:
            i += len(raw)
            w += 1
            # A space in the prefix absorbs a whole run of whitespace.
            if wanted[w - 1] == " ":
                while w < len(wanted) and wanted[w] == " ":
                    w += 1
            continue
        if norm == " ":  # extra whitespace in the HTML: skip it
            i += len(raw)
            continue
        if wanted[w] == " ":  # whitespace expected but absent: accept
            w += 1
            continue
        # Prefix cannot be located: fall back to the plain remainder so the
        # renderer never shows a doubled number.
        return ""

    while w < len(wanted) and wanted[w] == " ":
        w += 1
    if w < len(wanted):
        return ""
    result = ("".join(out) + rich[i:]).strip()
    # Whitespace that sat between the numbering and the text (often inside the
    # reopened <span>) would render as a double space after the number.
    return re.sub(r"^((?:<[^>]+>)*)\s+", r"\1", result)


def _classify_text_line(text: str, blocks: list, rich: str | None = None) -> Optional[object]:
    """Classify a single line (from HTML paragraph) into a typed block.

    ``rich`` is the inline-preserving HTML of the same paragraph (bold/italic
    kept); when present it is stored as the block content so the renderer can
    reproduce the author's formatting. Enumerations keep only the content
    (numbering is re-emitted by the renderer), preserving inline formatting.
    """
    stripped = text.strip()
    if not stripped:
        return None
    content = rich or text
    if _CONSIDERANDO_RE.match(stripped):
        return _block(ConsiderandoBlock, content=content, confidence=_CONFIRM_HIGH)
    if _PREAMBLE_RE.search(stripped) and len(stripped.split()) >= 6:
        return _block(PreambleBlock, content=content, confidence=_CONFIRM_MED)
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
        caput_plain = art.group(2).strip()
        prefix = stripped[: len(stripped) - len(caput_plain)]
        caput = _strip_rich_prefix(rich, prefix) if rich else caput_plain
        return _block(ArticleBlock, number=num or None, suffix=suffix,
                      caput=caput or caput_plain, confidence=_CONFIRM_HIGH)
    sole = _SOLE_PARAGRAPH_RE.match(stripped)
    if sole:
        body = sole.group(1).strip()
        prefix = stripped[: len(stripped) - len(body)] if body else ""
        inner = _strip_rich_prefix(rich, prefix) if rich else body
        return _block(ParagraphItemBlock, number=None, content=inner or body,
                      text=stripped, confidence=_CONFIRM_HIGH)
    para = _PARAGRAPH_RE.match(stripped)
    if para:
        body = (para.group(2).strip() or stripped)
        para_body = para.group(2).strip()
        prefix = stripped[: len(stripped) - len(para_body)] if para_body else ""
        inner = _strip_rich_prefix(rich, prefix) if rich else body
        return _block(ParagraphItemBlock,
                      number=(para.group(1) or "").strip() or None,
                      content=inner or body, text=stripped,
                      confidence=_CONFIRM_HIGH)
    if _LOCATION_DATE_RE.match(stripped):
        return _block(ParagraphBlock, content=content, confidence=_CONFIRM_MED,
                      metadata={"kind": "location_date"})
    inciso = _INCISO_RE.match(stripped)
    if inciso and inciso.group(1) in _ROMAN and not _ARTICLE_RE.match(stripped):
        body = inciso.group(2).strip()
        prefix = stripped[: len(stripped) - len(body)] if body else stripped
        inner = _strip_rich_prefix(rich, prefix) if rich else body
        return _block(IncisoBlock, number=inciso.group(1),
                      content=inner or body, text=stripped, confidence=_CONFIRM_HIGH)
    alinea = _ALINEA_RE.match(stripped)
    if alinea and len(alinea.group(1)) <= 2:
        body = alinea.group(2).strip()
        prefix = stripped[: len(stripped) - len(body)] if body else stripped
        inner = _strip_rich_prefix(rich, prefix) if rich else body
        return _block(AlineaBlock, number=alinea.group(1),
                      content=inner or body, text=stripped, confidence=_CONFIRM_HIGH)
    list_item = _LIST_ITEM_RE.match(stripped)
    if list_item:
        return _block(ListBlock, ordered=False, items=[list_item.group(1).strip()],
                      confidence=_CONFIRM_MED)
    if _FIELD_RE.match(stripped):
        return _block(ParagraphBlock, content=content, confidence=_CONFIRM_HIGH,
                      metadata={"kind": "field"})
    if _looks_like_signature(stripped):
        return _block(ParagraphBlock, content=text, confidence=_CONFIRM_LOW,
                      metadata={"kind": "signature"})
    return _block(ParagraphBlock, content=content, confidence=_CONFIRM_HIGH)


# ── Plain-text pass ──────────────────────────────────────────────────────────


def _parse_lines(text: str) -> list:
    blocks: list = []
    lines = _regroup_lines(text.split("\n"))
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

        if _FIELD_RE.match(stripped) and not _ARTICLE_RE.match(stripped):
            blocks.append(_block(ParagraphBlock, content=stripped,
                                 confidence=_CONFIRM_HIGH,
                                 metadata={"kind": "field"}))
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

    # Procurement forms frequently start each data row with a checkbox.  It
    # is a visual marker, not a data column: sizing it from its text length
    # made it consume as much as a quarter of the document and compressed the
    # label/value fields after publication.  Keep the original form geometry
    # (marker + field label + field value) whenever that pattern is clear.
    checkbox_markers = {"☐", "☑", "✓", "✔", "✕", "✖"}
    # Rows spanning the whole table are headings/notes, not field rows.  They
    # must not disqualify the checkbox-form pattern.
    first_column = [
        str(row[0]).strip()
        for row in rows
        if len(row) == ncols and row
    ]
    marker_rows = [value for value in first_column if value]
    if (
        ncols == 3
        and marker_rows
        and len(marker_rows) >= 2
        and all(value in checkbox_markers for value in marker_rows)
    ):
        return [2.5, 19.0, 78.5]

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
                elif t in ("br", "p", "div") and self._cell is not None:
                    # Uma célula com vários parágrafos (nome, cargo, órgão da
                    # assinatura) precisa manter as quebras: sem isso o texto
                    # sai emendado numa linha só.
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


_STYLED_TABLE_RE = re.compile(
    r"style=[\"'][^\"']*(?:border|background|width|font-family|font-size)",
    re.IGNORECASE,
)
# Uma célula em negrito não faz um quadro: o critério é a formatação própria,
# repetida, que só existe em conteúdo diagramado (modelo importado do Word).
_STYLED_TABLE_MIN = 3


def _preserved_table_block(table_html: str):
    """Mantém o quadro exatamente como foi diagramado, quando ele traz forma.

    Avisos de licitação/dispensa são publicados como um quadro cuja aparência
    (faixas, negrito, fontes, mesclagens) FAZ PARTE do ato — é o formato que a
    prefeitura usa e que o modelo importado do Word reproduz. Redesenhá-lo como
    tabela semântica descartaria essa formatação e colaria o conteúdo de cada
    célula. Tabelas sem formatação própria (as extraídas de PDF, por exemplo)
    seguem pelo caminho semântico, que lhes dá cabeçalho e quebra de página.
    """
    if not table_html:
        return None
    if len(_STYLED_TABLE_RE.findall(table_html)) < _STYLED_TABLE_MIN:
        return None
    from app.core.html_sanitizer import extract_plain_text, sanitize_html

    safe = sanitize_html(table_html)
    if "<table" not in safe.lower():
        return None
    text = re.sub(r"\n{2,}", "\n", extract_plain_text(safe)).strip()
    return _block(
        ParagraphBlock,
        content=text,
        rich=False,
        confidence=_CONFIRM_HIGH,
        metadata={"template_html": safe, "kind": "table_html"},
    )


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
