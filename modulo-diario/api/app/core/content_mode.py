"""Canonical content-mode semantics for matters (Fase 2).

A matter has EXACTLY ONE canonical content source at a time:

* ``semantic``      — only ``semantic_content`` (the SemanticDocument) is canonical.
* ``legacy_html``   — only ``content_html`` is canonical (legacy rich editor).
* ``original_pdf``  — only the uploaded original PDF file is canonical (pdf_reference).

These three replace the legacy ``rich_text`` / ``pdf`` values transparently.
When a matter is in ``semantic`` mode, the legacy HTML editor MUST NOT be able to
write a divergent ``content_html``. Switching modes requires an explicit,
user-confirmed transition and is recorded in the audit history.
"""

MODE_SEMANTIC = "semantic"
MODE_LEGACY_HTML = "legacy_html"
MODE_ORIGINAL_PDF = "original_pdf"

# Legacy values, kept for backward compatibility (map onto the canonical modes).
MODE_RICH_TEXT = "rich_text"
MODE_PDF = "pdf"

CANONICAL_MODES = {MODE_SEMANTIC, MODE_LEGACY_HTML, MODE_ORIGINAL_PDF}
LEGACY_MODES = {MODE_RICH_TEXT, MODE_PDF}
ALL_MODES = CANONICAL_MODES | LEGACY_MODES

CANONICAL_SOURCE_FIELD = {
    MODE_SEMANTIC: "semantic_content",
    MODE_LEGACY_HTML: "content_html",
    MODE_ORIGINAL_PDF: "content_pdf",
}


def normalize_mode(mode: str | None) -> str:
    """Map a stored/requested mode onto one of the canonical values."""
    if mode is None:
        return MODE_LEGACY_HTML
    mode = str(mode).strip().lower()
    if mode == MODE_RICH_TEXT:
        return MODE_LEGACY_HTML
    if mode == MODE_PDF:
        return MODE_ORIGINAL_PDF
    if mode in CANONICAL_MODES:
        return mode
    # Unknown → treat as legacy HTML (backward compatible, not semantic).
    return MODE_LEGACY_HTML


def is_semantic(mode: str | None) -> bool:
    return normalize_mode(mode) == MODE_SEMANTIC
