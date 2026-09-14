"""Regression tests for automatic table diagramming and semantic derivation.

Covers the problems seen in the published accounting tables: numbers split
across lines, artificial per-matter page breaks and legacy rich-text matters
that were never recognized as official acts.
"""

from types import SimpleNamespace

import pytest

from app.semantic.parser import parse_document
from app.semantic.renderer import render_document
from app.semantic.snapshot import derive_semantic_from_matter, matter_snapshot
from app.semantic.templates import default_config_for


def _table(doc):
    return next(b for b in doc.blocks if b.type == "table")


def test_tab_table_without_header_keeps_first_row_as_data():
    text = (
        "1\tBucha de Redução\tPLASTILIT\tUN\t30.000\t1,1800\n"
        "2\tJoelho 90\tVALLE\tUN\t50.000\t3,4700\n"
    )
    doc = parse_document(plain=text, title="Relação")
    table = _table(doc)
    assert table.headers == []
    assert len(table.rows) == 2
    assert table.original_data[0][0] == "1"


def test_tab_table_with_header_detected():
    text = "Produto\tQtd\tValor\nCaneta\t10\tR$ 5,00\n"
    doc = parse_document(plain=text, title="x")
    table = _table(doc)
    assert table.headers == ["Produto", "Qtd", "Valor"]
    assert len(table.rows) == 1


def test_mixed_text_and_table_keeps_both():
    text = (
        "RELATÓRIO DE COMPRAS\n\n"
        "Segue a relação abaixo.\n\n"
        "Item\tDescrição\tValor\n"
        "1\tCaneta\t5,00\n"
        "2\tPapel\t12,00\n\n"
        "Total geral: R$ 17,00\n"
    )
    doc = parse_document(plain=text, title="x")
    types = [b.type for b in doc.blocks]
    assert "table" in types
    assert types.count("paragraph") >= 2
    # table is in the middle, textual blocks around it survive
    table_idx = types.index("table")
    assert table_idx > 0
    assert table_idx < len(types) - 1


def test_column_widths_computed_and_sum_to_100():
    text = (
        "Item\tDescrição do produto\tValor unitário\n"
        "1\tBucha de Redução soldável curta marrom 32x25mm\t1,1800\n"
    )
    doc = parse_document(plain=text, title="x")
    widths = _table(doc).column_widths
    assert len(widths) == 3
    assert abs(sum(widths) - 100.0) < 0.5
    # the long description column must be the widest
    assert widths[1] == max(widths)


def test_html_table_without_th_keeps_all_rows_and_no_headers():
    html = (
        "<table><tbody>"
        "<tr><td>1</td><td>Bucha</td><td>30.000</td></tr>"
        "<tr><td>2</td><td>Joelho</td><td>50.000</td></tr>"
        "</tbody></table>"
    )
    doc = parse_document(html=html, title="x")
    table = _table(doc)
    assert table.headers == []
    assert len(table.rows) == 2


def test_html_table_with_th_and_br_is_parsed():
    html = (
        "<table><thead><tr><th>Item</th><th>Descrição</th></tr></thead>"
        "<tbody><tr><td>1</td><td>Bucha<br>32x25mm</td></tr></tbody></table>"
    )
    doc = parse_document(html=html, title="x")
    table = _table(doc)
    assert table.headers == ["Item", "Descrição"]
    # header row is preserved in rows (with header=True) and data follows it
    assert table.rows[0][0].header is True
    assert "32x25mm" in table.rows[1][1].content


def test_print_render_emits_colgroup_without_cell_overflow():
    text = (
        "Item\tDescrição\tQuantidade\tValor\n"
        "1\tBucha de Redução\t30.000\t1,1800\n"
    )
    doc = parse_document(plain=text, title="x")
    html = render_document(doc, default_config_for("outros"), media="print")
    assert "<colgroup>" in html
    assert "table-layout:fixed" in html
    assert "doe-cell--num" in html
    assert "overflow-wrap: anywhere" in html
    assert ".doe-table .doe-cell--num { white-space: normal" in html


def test_summary_detected_with_single_line_break():
    text = "PORTARIA Nº 10/2026\nSÚMULA: EXONERA SERVIDOR.\nArt. 1º Exonera.\n"
    doc = parse_document(plain=text, title="x")
    assert doc.summary_label == "SÚMULA"
    assert "EXONERA SERVIDOR" in doc.summary


def test_legacy_matter_derives_semantic_at_snapshot():
    matter = SimpleNamespace(
        id="m1",
        semantic_content=None,
        content_json=None,
        content_mode="rich_text",
        content_html=(
            "<p><strong>PORTARIA Nº 5/2026</strong></p>"
            "<p>SÚMULA: NOMEIA COMISSÃO.</p>"
            "<p><strong>RESOLVE:</strong></p>"
            "<p><strong>Art. 1º</strong> Fica nomeada a comissão.</p>"
        ),
        title="PORTARIA Nº 5/2026",
        summary="NOMEIA COMISSÃO.",
        responsible_id=None,
        responsible_name=None,
        responsible_role=None,
        metadata_json=None,
        version=1,
        status="published",
        act_type_id=None,
        org_unit_id=None,
        act_number=None,
        act_year=None,
        act_date=None,
        publication_type="normal",
        references_matter_id=None,
        semantic_schema_version=None,
        template_id=None,
        template_version=None,
        text_integrity_hash=None,
        source_hash=None,
        attachments=[],
    )
    # Direct derivation produces typed blocks.
    derived = derive_semantic_from_matter(matter)
    assert derived is not None
    assert any(b.type == "command" for b in derived.blocks)
    assert any(b.type == "article" for b in derived.blocks)

    # And the snapshot freezes it so the PDF can render it automatically.
    snap = matter_snapshot(matter, position=1, section_title="Atos")
    assert snap["semantic"] is not None
    assert snap["semantic_hash"]


def test_uploaded_pdf_matter_is_not_derived():
    matter = SimpleNamespace(
        content_mode="original_pdf",
        content_html='<img src="/uploads/matter-content/x/page_1.png">',
        semantic_content=None,
        content_json=None,
        title="Original",
        summary=None,
    )
    assert derive_semantic_from_matter(matter) is None


# ── Wide tables (>12 columns): split into stacked portrait groups ────────────
#
# Accounting/procurement tables (empenho, licitação) routinely carry 12-20+
# columns. Rather than switching the page to landscape (ruled out so every
# page of the Diário stays the same size), the renderer splits them into
# stacked column groups that repeat the leading (label) column. This is the
# only place that behavior (`_render_split_table`) is exercised end to end.


def _wide_table_text(ncols: int, nrows: int = 2) -> str:
    header = "\t".join(f"Coluna{i}" for i in range(ncols))
    rows = "\n".join(
        "\t".join(
            [f"Item-{r}"] + [f"{r}-{i}" for i in range(1, ncols)]
        )
        for r in range(nrows)
    )
    return f"{header}\n{rows}\n"


def test_wide_table_is_split_into_stacked_groups():
    doc = parse_document(plain=_wide_table_text(15), title="Empenho")
    html = render_document(doc, default_config_for("outros"), media="print")
    assert '<div class="doe-table-split">' in html
    # 15 columns, first is the repeated key -> groups of (8-1)=7 data cols each:
    # group 1 = key + 7 data cols (8 total), group 2 = key + 7 remaining (8 total).
    assert html.count("<table") == 2
    assert "Continuação — colunas 2/2" in html


def test_wide_table_split_repeats_the_key_column_in_every_group():
    doc = parse_document(plain=_wide_table_text(15), title="Empenho")
    html = render_document(doc, default_config_for("outros"), media="print")
    # The first column ("Coluna0" header / "Item-0" data) must appear in both
    # groups so each stacked table still reads on its own.
    assert html.count("Coluna0") == 2
    assert html.count("Item-0") == 2


def test_narrow_table_is_not_split():
    doc = parse_document(plain=_wide_table_text(6), title="Tabela normal")
    html = render_document(doc, default_config_for("outros"), media="print")
    assert '<div class="doe-table-split">' not in html
    assert html.count("<table") == 1


def test_wide_table_with_merged_cells_is_never_split():
    """Splitting a table with colspan/rowspan could not preserve the spans
    correctly (a merged cell could straddle two column groups), so the
    renderer deliberately leaves spanned wide tables as a single table."""
    from app.semantic.schemas import (
        SemanticDocument,
        TableBlock,
        TableCell,
    )

    headers = [f"Coluna{i}" for i in range(14)]
    row = [TableCell(content=f"v{i}") for i in range(14)]
    row[0] = TableCell(content="Total", colspan=2)
    table = TableBlock(id="t1", headers=headers, rows=[row])
    doc = SemanticDocument(document_type="outros", title="X", blocks=[table])

    html = render_document(doc, default_config_for("outros"), media="print")
    assert '<div class="doe-table-split">' not in html
    assert html.count("<table") == 1
    assert "colspan='2'" in html


def test_wide_table_real_pdf_render_repeats_header_and_fits_portrait_pages():
    """End-to-end: a >12-column table, spanning enough rows to paginate,
    must render as valid multi-page A4 portrait output with the split
    group's own header ('Coluna0') visible on more than one page."""
    pytest.importorskip("weasyprint")
    import io as _io

    from pypdf import PdfReader
    from weasyprint import HTML

    doc = parse_document(plain=_wide_table_text(15, nrows=60), title="Empenho Geral")
    body_html = render_document(
        doc, default_config_for("outros"), media="print", include_page_rules=True
    )
    pdf_bytes = HTML(string=f"<html><body>{body_html}</body></html>").write_pdf()
    pages = PdfReader(_io.BytesIO(pdf_bytes)).pages

    assert len(pages) > 1
    for page in pages:
        assert float(page.mediabox.height) > float(page.mediabox.width)

    pages_with_header = sum(1 for p in pages if "Coluna0" in p.extract_text())
    assert pages_with_header > 1
