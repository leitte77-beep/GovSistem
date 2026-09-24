"""Fase 6 — HTML security of the semantic renderer."""

import pytest

from app.semantic.renderer import _safe_url, render_document
from app.semantic.schemas import SemanticDocument
from app.semantic.templates import default_config_for

CFG = default_config_for("outro")


def _doc(blocks) -> SemanticDocument:
    return SemanticDocument(title="Segurança", blocks=blocks)


def test_legacy_html_is_sanitized_against_script():
    payload = (
        '<p>ok</p><script>alert(1)</script>'
        '<iframe src="https://evil"></iframe>'
        '<img src=x onerror=alert(1)>'
        '<a href="javascript:alert(1)">clique</a>'
    )
    doc = _doc([{"type": "legacy_html", "content": payload}])
    html = render_document(doc, CFG, media="screen")
    assert "<script" not in html
    assert "<iframe" not in html
    assert "onerror=" not in html
    assert "javascript:" not in html
    # safe content survives
    assert "ok" in html


def test_legacy_html_blocks_event_handlers():
    payload = '<p onclick="alert(1)">x</p><p><svg onload="x()"></svg></p>'
    doc = _doc([{"type": "legacy_html", "content": payload}])
    html = render_document(doc, CFG, media="screen")
    assert "onclick" not in html
    assert "onload" not in html


def test_rich_block_escapes_and_sanitizes():
    payload = '<p onclick="alert(1)"><b>negrito</b> texto</p>'
    doc = _doc([{"type": "paragraph", "content": payload}])
    html = render_document(doc, CFG, media="screen")
    assert "onclick" not in html
    assert "<b>negrito</b>" in html or "<strong>negrito</strong>" in html


def test_plain_blocks_escape_user_text_by_default():
    doc = _doc([{"type": "paragraph", "content": "<script>alert(1)</script> <b>X</b>"}])
    html = render_document(doc, CFG, media="screen")
    assert "<script" not in html


def test_safe_url_blocks_dangerous_schemes():
    assert _safe_url("javascript:alert(1)") == ""
    assert _safe_url("vbscript:msgbox(1)") == ""
    assert _safe_url("file:///etc/passwd") == ""
    assert _safe_url("data:text/html,<script>") == ""
    assert _safe_url("https://ok.example/x.png").startswith("https://ok.example")
    assert _safe_url("data:image/png;base64,AAA").startswith("data:image/png")


def test_image_src_blocks_javascript_and_data_html():
    doc = _doc([
        {"type": "image", "src": "javascript:alert(1)", "alt": "x"},
        {"type": "image", "src": "data:text/html,<b>x</b>", "alt": "y"},
    ])
    html = render_document(doc, CFG, media="screen")
    assert "javascript:" not in html
    assert "data:text/html" not in html


def test_pdf_reference_href_is_sanitized():
    doc = _doc([{"type": "pdf_reference", "src": "javascript:alert(1)", "page_count": 1, "mode": "pdf_original"}])
    html = render_document(doc, CFG, media="screen")
    assert "javascript:" not in html


def test_no_double_sanitize_breaks_legit_content():
    doc = _doc([{"type": "legacy_html", "content": "<p><strong>Valor R$ 1.000,00</strong></p>"}])
    html = render_document(doc, CFG, media="screen")
    assert "Valor R$ 1.000,00" in html
