"""Testes do PDF Inspector (Fase 4 / P0)."""

import io

import pytest
from pypdf import PdfReader

from app.services.edition_pdf_inspector import inspect_edition_pdf


def _render_html_with_anchors(matter_ids: list[str]) -> bytes:
    pytest.importorskip("weasyprint")
    from weasyprint import HTML

    sections = "".join(
        f'<section id="matter-{mid}" style="break-before: page">'
        f"<h1>Matéria {mid}</h1><p>Conteúdo da matéria {mid}.</p></section>"
        for mid in matter_ids
    )
    html = (
        "<html><head><title>Diário Teste</title></head><body>"
        f"<h1>Diário Oficial</h1>{sections}</body></html>"
    )
    return HTML(string=html).write_pdf()


def test_inspector_finds_all_anchors_and_pages():
    pdf = _render_html_with_anchors(["aaa", "bbb"])
    report = inspect_edition_pdf(pdf, expected_matter_ids=["aaa", "bbb"])

    assert report["ok"] is True, report["errors"]
    assert report["page_count"] >= 2
    assert "matter-aaa" in report["page_number_by_anchor"]
    assert "matter-bbb" in report["page_number_by_anchor"]
    assert report["page_number_by_anchor"]["matter-aaa"] == 2
    assert report["missing_anchors"] == []


def test_inspector_flags_missing_anchor_as_error():
    pdf = _render_html_with_anchors(["aaa"])
    report = inspect_edition_pdf(pdf, expected_matter_ids=["aaa", "zzz"])

    assert report["ok"] is False
    codes = {e["code"] for e in report["errors"]}
    assert "MISSING_MATTER_ANCHOR" in codes
    assert report["missing_anchors"] == ["matter-zzz"]


def test_inspector_detects_unexpected_signature_state():
    pdf = _render_html_with_anchors(["aaa"])
    report = inspect_edition_pdf(pdf, expected_matter_ids=["aaa"], expect_signature=True)
    assert report["ok"] is False
    assert "MISSING_SIGNATURE" in {e["code"] for e in report["errors"]}
    assert report["has_signature"] is False


def test_inspector_unreadable_pdf_fails_closed():
    report = inspect_edition_pdf(b"not a pdf", expected_matter_ids=["aaa"])
    assert report["ok"] is False
    assert report["errors"][0]["code"] == "PDF_UNREADABLE"
    assert report["missing_anchors"] == ["aaa"]
