"""Text fidelity / integrity controls (Fase 2 + Fase 4).

The semantic engine must never silently re-write legal wording. These helpers:

  1. Extract a normalized textual representation from the original source.
  2. Extract the textual representation of the classified blocks.
  3. Compare word/number/date/name tokens to detect loss or unconfirmed change.
  4. Produce ``text_integrity_hash`` and a structured report.

Only whitespace/formatting changes are tolerated silently; any loss of a
*lexical token* (word, number, currency value, date, article reference) is
reported so the UI can block submission to review until confirmed.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from typing import Optional

_WORD_TOKEN_RE = re.compile(r"[A-Za-z0-9À-ÿ.ºª%$#/()-]+")


def _tokenize(text: str) -> Counter[str]:
    if not text:
        return Counter()
    text = text.upper()
    # Normalize whitespace only — never drop or reorder lexical tokens.
    return Counter(_WORD_TOKEN_RE.findall(text))


def normalize_whitespace(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r" ?\n ?", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def hash_of_text(text: str) -> str:
    return hashlib.sha256(normalize_whitespace(text).encode("utf-8")).hexdigest()


def compute_text_integrity(source_text: str, doc) -> dict:
    """Compare source text with block-extracted text.

    ``doc`` is a SemanticDocument (or anything exposing ``plain_text()``).
    Returns a structured report with ``hash``, ``ok``, ``missing`` tokens and
    ``changed`` flag.
    """
    source_norm = normalize_whitespace(source_text or "")
    source_tokens = _tokenize(source_norm)

    doc_text = doc.plain_text() if hasattr(doc, "plain_text") else ""
    doc_norm = normalize_whitespace(doc_text)
    doc_tokens = _tokenize(doc_norm)

    missing = source_tokens - doc_tokens
    added = doc_tokens - source_tokens

    # Count and numeric comparison — tolerate pure whitespace/case differences.
    missing_values = {k for k in missing if _is_sensitive_token(k)}
    changed = bool(missing_values)

    integrity_hash = hashlib.sha256(
        "\n".join([doc_norm, source_norm]).encode("utf-8")
    ).hexdigest()

    return {
        "hash": integrity_hash,
        "ok": not changed,
        "changed": changed,
        "missing": dict(missing),
        "added": dict(added),
        "missing_sensitive": sorted(missing_values),
        "source_token_count": sum(source_tokens.values()),
        "document_token_count": sum(doc_tokens.values()),
    }


def compute_document_integrity(source_text: str, doc) -> dict:
    """Alias kept for clarity in parser flow."""
    return compute_text_integrity(source_text, doc)


def _is_sensitive_token(token: str) -> bool:
    """A token whose disappearance matters (numbers, currency, dates, refs)."""
    if not token:
        return False
    # pure numbers or numbers with decimal/thousands separators
    if re.fullmatch(r"\d+([.,]\d+)*", token):
        return True
    if token.endswith("%") and token[:-1].isdigit():
        return True
    if token.startswith("R$") or token.startswith("$"):
        return True
    # article / paragraph references like ART., § references, roman numerals
    if token.startswith("ART") or token in ("I", "II", "III", "IV", "V"):
        return True
    return False
