"""Input normalization for the semantic engine (Fase 4).

Converts raw user input (typed HTML, Word paste, plain text, tab-separated,
PDF-extracted text, legacy HTML) into a safe, normalized intermediate form
that the deterministic parser can consume. Never re-writes legal wording.
"""

from __future__ import annotations

import re

from app.core.html_sanitizer import sanitize_html

_TAB_SEPARATED_THRESHOLD = 2
_NEWLINE_HARD_BREAK_RE = re.compile(r"(?:\r\n|\r|\n)")


def _count_tabs(text: str) -> int:
    return text.count("\t")


def normalize_plain_text(text: str) -> str:
    """Normalize plain text preserving meaningful line structure.

    Collapses the stray hard-wrap that PDF extraction introduces while keeping
    paragraph breaks. Words/numbers are never altered.
    """
    if not text:
        return ""
    text = _NEWLINE_HARD_BREAK_RE.sub("\n", text)
    # Collapse runs of blank lines to a single blank line.
    text = re.sub(r"[ \t]+$", "", text, flags=re.M)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def is_tab_separated(text: str) -> bool:
    if not text or _count_tabs(text) < _TAB_SEPARATED_THRESHOLD:
        return False
    lines = [ln for ln in text.split("\n") if ln.strip()]
    if not lines:
        return False
    return _count_tabs(lines[0]) >= 1


def looks_like_pdf_extraction(text: str) -> bool:
    """Heuristics for text extracted from a PDF with artificial hard breaks."""
    if not text:
        return False
    lines = [ln for ln in text.split("\n") if ln.strip()]
    if not lines:
        return False
    hard_breaks = 0
    for ln in lines:
        if not ln[-1:] in ".!?:" and not re.match(r"^(\d+|Art\.|§|\w\)|\[IVXLCDM]+\b)", ln):
            hard_breaks += 1
    return (hard_breaks / len(lines)) > 0.55


def normalize_html(html: str) -> str:
    """Sanitize pasted/typed HTML (Word, web, rich editor) safely."""
    return sanitize_html(html)


def html_to_plain_text(html: str) -> str:
    from app.core.html_sanitizer import extract_plain_text

    return extract_plain_text(html)


def normalize_input(
    *,
    html: str | None = None,
    plain: str | None = None,
) -> dict:
    """Normalize user input into a clean, structured payload for the parser.

    Returns a dict with:
      * ``source_type``: paste_html | paste_plain | tab_separated
      * ``html``: sanitized HTML if rich input was provided
      * ``text``: normalized plain text
      * ``tabs``: rows of tab-separated values (if tab-separated)
    """
    if html and html.strip():
        safe_html = normalize_html(html)
        text = html_to_plain_text(safe_html)
        return {
            "source_type": "paste_html",
            "html": safe_html,
            "text": text,
            "tabs": None,
        }

    plain = plain or ""
    # Detect tab-separated on the RAW text BEFORE collapsing whitespace,
    # because normalization must preserve tabs that mark table columns.
    raw_tabs = None
    if is_tab_separated(plain):
        raw_tabs = [
            [cell.strip() for cell in ln.split("\t")]
            for ln in plain.split("\n")
            if ln.strip()
        ]
    text = normalize_plain_text(plain)
    if raw_tabs is not None:
        return {
            "source_type": "tab_separated",
            "html": None,
            "text": text,
            "tabs": raw_tabs,
        }
    return {
        "source_type": "paste_plain",
        "html": None,
        "text": text,
        "tabs": None,
    }
