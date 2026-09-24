"""Deterministic metadata suggestions for a parsed official act.

Given a ``SemanticDocument`` produced by the deterministic parser, infer the
most likely act type, number and year so the author can confirm them instead of
typing. This is intentionally regex-driven (no AI): when a value cannot be
recognized the field is simply omitted rather than guessed.
"""

from __future__ import annotations

import re

from .schemas import HeadingBlock, SemanticDocument

# Ordered from most specific to least specific: the first match wins.
_ACT_TYPE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bDECRETO\b", re.IGNORECASE), "Decreto"),
    (re.compile(r"\bPORTARIA\b", re.IGNORECASE), "Portaria"),
    (re.compile(r"\bRESOLU[ÇC][ÃA]O\b", re.IGNORECASE), "Resolução"),
    (re.compile(r"\bEDITAL\b", re.IGNORECASE), "Edital"),
    (re.compile(r"\bEXTRATO\b", re.IGNORECASE), "Contrato"),
    (re.compile(r"\bCONTRATO\b", re.IGNORECASE), "Contrato"),
    (re.compile(r"\bPREG[ÃA]O\b|\bAVISO\b|\bLICITA[ÇC][ÃA]O\b", re.IGNORECASE), "Licitação"),
    (re.compile(r"\bATA\b", re.IGNORECASE), "Ata"),
    (re.compile(r"\bRELAT[ÓO]RIO\b", re.IGNORECASE), "Relatório Contábil"),
    (re.compile(r"\bLEI\b", re.IGNORECASE), "Lei"),
]

_NUMBER_RE = re.compile(r"\bN[º°o.]?\s*(\d{1,6})\b", re.IGNORECASE)
_YEAR_SLASH_RE = re.compile(r"/\s*((?:19|20)\d{2})\b")
_YEAR_BARE_RE = re.compile(r"\b(?:DE\s+)?((?:19|20)\d{2})\b", re.IGNORECASE)

_MAX_CANDIDATES = 5


def _candidate_texts(document: SemanticDocument, title: str) -> list[str]:
    """Ordered texts to search, most authoritative first."""
    candidates: list[str] = []
    for value in (title, document.title):
        if value and value.strip() and value.strip() not in candidates:
            candidates.append(value.strip())
    for block in document.blocks:
        if isinstance(block, HeadingBlock) and block.text.strip():
            if block.text.strip() not in candidates:
                candidates.append(block.text.strip())
        if len(candidates) >= _MAX_CANDIDATES:
            break
    # Fallback: the raw body always starts with the act heading, even when the
    # parser had no dedicated structured title/heading to rely on.
    plain = document.plain_text().strip()
    if plain:
        candidates.append(plain[:500])
    return candidates[:_MAX_CANDIDATES + 1]


def _match_act_type(texts: list[str]) -> str | None:
    for text in texts:
        for pattern, name in _ACT_TYPE_PATTERNS:
            if pattern.search(text):
                return name
    return None


def _match_number(texts: list[str]) -> str | None:
    for text in texts:
        match = _NUMBER_RE.search(text)
        if match:
            return match.group(1)
    return None


def _match_year(texts: list[str]) -> int | None:
    for text in texts:
        match = _YEAR_SLASH_RE.search(text) or _YEAR_BARE_RE.search(text)
        if match:
            return int(match.group(1))
    return None


def suggest_metadata(
    document: SemanticDocument, *, title: str = ""
) -> dict[str, object]:
    """Return deterministic act metadata suggestions (+ a confidence score)."""
    texts = _candidate_texts(document, title)
    act_type_name = _match_act_type(texts)
    act_number = _match_number(texts)
    act_year = _match_year(texts)

    suggested_title = (title or document.title or "").strip() or None
    if not suggested_title and texts:
        suggested_title = texts[0]

    confidence = 0.0
    if act_type_name:
        confidence += 0.4
    if act_number:
        confidence += 0.3
    if act_year:
        confidence += 0.3

    return {
        "act_type_name": act_type_name,
        "act_number": act_number,
        "act_year": act_year,
        "title": suggested_title,
        "summary": document.summary or None,
        "summary_label": document.summary_label,
        "confidence": round(confidence, 2),
    }
