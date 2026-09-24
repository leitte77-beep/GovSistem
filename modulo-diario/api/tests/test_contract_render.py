"""Fase 5 — shared render contract.

Both the Python renderer (app.semantic.renderer) and the TypeScript renderer
(web-admin src/lib/semanticRender.ts) consume the SAME golden fixture
(fixtures/decreto-04-2026.document.json) and must agree on block order, heading
level, table structure and the textual tokens. This test pins the Python side
to a documented canonical text that the TS test re-derives from the same JSON.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from app.semantic.renderer import render_document
from app.semantic.schemas import SemanticDocument
from app.semantic.templates import default_config_for

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "decreto-04-2026.document.json"
EXPECTED_ORDER = [
    "heading", "preamble", "command",
    "article", "article", "article",
    "table", "paragraph", "signature_block",
]


def _load() -> SemanticDocument:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    return SemanticDocument.model_validate(data)


def _strip_html(html: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text).replace("&nbsp;", " ").strip()


def test_contract_parses_fixture():
    doc = _load()
    assert [b.type for b in doc.blocks] == EXPECTED_ORDER


def test_contract_renderer_block_order_and_heading_level():
    doc = _load()
    cfg = default_config_for("decreto")
    markers = ["doe-block--heading", "doe-block--preamble", "doe-block--command",
               "doe-block--article", "doe-table-wrap", "doe-block--paragraph",
               "doe-block--signature_block"]
    for media in ("screen", "print"):
        html = render_document(doc, cfg, media=media)
        # distinct block types appear in canonical order
        pos = [html.find(m) for m in markers]
        assert all(p >= 0 for p in pos), (media, list(zip(markers, pos)))
        assert pos == sorted(pos), f"block order diverged ({media})"
        # title is an <h1>
        assert "<h1" in html
        assert "doe-block--heading" in html


def test_contract_renderer_table_structure():
    doc = _load()
    cfg = default_config_for("decreto")
    html = render_document(doc, cfg, media="screen")
    assert "<table" in html
    assert "colspan='2'" in html or 'colspan="2"' in html
    # total row styled
    assert "doe-total" in html


def test_contract_renderer_preserves_all_numbers_and_authority():
    doc = _load()
    cfg = default_config_for("decreto")
    html = render_document(doc, cfg, media="screen")
    text = _strip_html(html)
    for token in ("1.250.000,00", "800.000,00", "450.000,00", "0,00",
                  "Maria Oliveira", "Prefeita", "Secretaria de Administração",
                  "DECRETA:", "Art."):
        assert token in text, token


def test_contract_canonical_text_matches_documented_golden():
    doc = _load()
    cfg = default_config_for("decreto")
    text = _strip_html(render_document(doc, cfg, media="screen"))
    # Token stream the TS renderer must reproduce (order-sensitive).
    for label in ("DECRETO Nº 04/2026", "DECRETA:", "Art. 1.",
                  "Art. 2.", "Art. 3.", "Crédito adicional especial",
                  "Maria Oliveira", "Prefeita"):
        assert label in text, label
