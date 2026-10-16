"""Diagramação automática de tabelas para o PDF (app/services/print_tables.py)."""

import re

from lxml import html as lxml_html

from app.services.print_tables import (
    USABLE_WIDTH_PT,
    _min_pct,
    _word_em,
    prepare_tables_for_print,
)


def _table(out: str):
    return lxml_html.fragment_fromstring(out, create_parent="div").find(".//table")


def _col_widths(out: str) -> list[float]:
    return [
        float(re.search(r"width:([\d.]+)%", col.get("style")).group(1))
        for col in _table(out).iter("col")
    ]


def _text(html: str) -> str:
    return " ".join(lxml_html.fragment_fromstring(html, create_parent="div").text_content().split())


# Tabela do Termo de Adjudicação da edição 52/2026: 9 colunas cujas larguras
# somavam 110% — a última coluna saiu cortada fora da página.
HOMOLOGACAO = (
    '<p>Adjudicando e Homologando o procedimento</p>'
    '<table class="doc-table"><colgroup>'
    + "".join(f'<col style="width:{w}%;">' for w in (5, 5, 30, 15, 5, 8, 10, 12, 20))
    + "</colgroup><thead><tr>"
    + "".join(f"<th>{h}</th>" for h in (
        "lote", "Ordem", "Descrição", "Marca", "Unidade", "Quantidade",
        "Valor Unitário", "Valor Total", "Nome"))
    + "</tr></thead><tbody>"
    + "<tr>" + "".join(f"<td>{v}</td>" for v in (
        "1", "1", "Suplemento nutricional que contém uma combinação exclusiva de Cálcio",
        "NUTRILLA R", "UN", "100.0000", "73,4500", "7.345,0000",
        "BRAVONUTRI COMERCIO DE PRODUTOS NUTRICIONAIS EIRELI - EPP")) + "</tr>"
    + "</tbody></table><p>Fim.</p>"
)


def test_column_widths_always_add_up_to_100_percent():
    out = prepare_tables_for_print(HOMOLOGACAO)
    widths = _col_widths(out)
    assert len(widths) == 9
    assert abs(sum(widths) - 100) < 0.1


def test_wide_table_gets_fixed_layout_and_smaller_font():
    table = _table(prepare_tables_for_print(HOMOLOGACAO))
    style = table.get("style")
    assert "table-layout:fixed" in style
    assert "width:100%" in style
    assert re.search(r"font-size:(\d+(\.\d+)?)pt", style)
    assert float(re.search(r"font-size:([\d.]+)pt", style).group(1)) <= 8
    assert "doe-print-table--compact" in table.get("class")


def test_text_is_never_changed():
    assert _text(prepare_tables_for_print(HOMOLOGACAO)) == _text(HOMOLOGACAO)


def test_column_is_wide_enough_for_its_longest_word():
    # "N° PROCEDIMENTO" quebrava em "PROCEDIMENT/O" com as colunas espremidas.
    html = (
        "<table><tr><td>☑</td><td>N° PROCESSO</td><td>125/2026</td></tr>"
        "<tr><td>☑</td><td>N° PROCEDIMENTO</td><td>47/2026</td></tr>"
        "<tr><td>☑</td><td>OBJETO</td><td>Locação, montagem e desmontagem de pavilhão "
        "móvel tipo galpão, medindo 10m x 65m e serviços afins.</td></tr></table>"
    )
    out = prepare_tables_for_print(html)
    widths = _col_widths(out)
    assert abs(sum(widths) - 100) < 0.1
    assert widths[1] >= _min_pct(_word_em("PROCEDIMENTO", False), 12.0)
    # A descrição longa fica com a maior parte da largura.
    assert widths[2] == max(widths)


def test_author_widths_are_kept_when_complete_and_sufficient():
    html = (
        '<table><tr><td style="width:2cm">263</td><td style="width:10cm">Outros serviços</td>'
        '<td style="width:4cm">220.229,86</td></tr></table>'
    )
    assert _col_widths(prepare_tables_for_print(html)) == [12.5, 62.5, 25.0]


def test_merged_cells_do_not_shift_the_grid():
    html = (
        '<table><tr><td colspan="2">Órgão: 7 – SECRETARIA DE EDUCAÇÃO</td></tr>'
        '<tr><td style="width:30%">a</td><td style="width:70%">b</td></tr></table>'
    )
    assert _col_widths(prepare_tables_for_print(html)) == [30.0, 70.0]


def test_th_rows_move_to_thead_so_they_repeat_on_every_page():
    html = (
        "<table><tbody><tr><th>Item</th><th>Descrição</th></tr>"
        "<tr><td>1</td><td>a</td></tr><tr><td>2</td><td>b</td></tr></tbody></table>"
    )
    table = _table(prepare_tables_for_print(html))
    thead = table.find("thead")
    assert thead is not None
    assert [th.text for th in thead.iter("th")] == ["Item", "Descrição"]
    assert len(table.find("tbody").findall("tr")) == 2


def test_bold_first_row_becomes_header():
    html = (
        "<table><tr><td><p><strong>Item</strong></p></td><td><p><b>Valor</b></p></td></tr>"
        "<tr><td>1</td><td>10,00</td></tr><tr><td>2</td><td>20,00</td></tr></table>"
    )
    table = _table(prepare_tables_for_print(html))
    assert table.find("thead") is not None
    assert len(table.find("thead").findall(".//th")) == 2


def test_small_two_row_table_does_not_get_an_invented_header():
    html = "<table><tr><td><b>A</b></td><td><b>B</b></td></tr><tr><td>1</td><td>2</td></tr></table>"
    assert "<thead" not in prepare_tables_for_print(html)


def test_cell_widths_are_moved_to_colgroup():
    html = '<table style="width:453pt"><tr><td style="width:2cm;background-color:#eee">x</td><td width="300">y</td></tr></table>'
    table = _table(prepare_tables_for_print(html))
    for cell in table.iter("td"):
        assert "width" not in (cell.get("style") or "")
        assert cell.get("width") is None
    assert "background-color:#eee" in table.find(".//td").get("style")


def test_nested_tables_are_laid_out_independently():
    html = (
        "<table><tr><td>fora</td><td><table><tr><td>a</td><td>b</td><td>c</td></tr></table></td></tr></table>"
    )
    out = prepare_tables_for_print(html)
    root = lxml_html.fragment_fromstring(out, create_parent="div")
    outer, inner = list(root.iter("table"))
    assert len(list(outer.find("colgroup"))) == 2
    assert len(list(inner.find("colgroup"))) == 3


def test_html_without_tables_is_untouched():
    html = "<p><strong>DECRETA:</strong></p><p>Art. 1º ...</p>"
    assert prepare_tables_for_print(html) == html


def test_text_around_tables_is_preserved():
    out = prepare_tables_for_print("antes<table><tr><td>x</td></tr></table>depois")
    assert out.startswith("antes")
    assert out.endswith("depois")


def test_usable_width_matches_classic_layout_margins():
    # A4 (595,3pt) menos 1,7cm de cada lado (edition.css do layout clássico).
    assert 495 < USABLE_WIDTH_PT < 500


def test_uppercase_words_are_measured_wider_than_lowercase():
    assert _word_em("PROCEDIMENTO", False) > _word_em("procedimento", False)
    assert _word_em("PROCEDIMENTO", True) > _word_em("PROCEDIMENTO", False)
