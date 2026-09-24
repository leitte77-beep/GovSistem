"""Importação visual de .docx que trazem o ato dentro de uma tabela.

Avisos de licitação/dispensa são publicados como quadro: no Word o ato inteiro
é uma tabela. Antes, o conversor lia apenas ``doc.paragraphs`` e produzia um
modelo vazio — sem erro, o que é pior: o modelo parecia importado.
"""

from __future__ import annotations

import pytest

docx = pytest.importorskip("docx")

from app.document_model.word_template import convert, table_html  # noqa: E402


def _doc_with_table(tmp_path):
    document = docx.Document()
    document.add_paragraph("Município de Farol, torna público:")
    table = document.add_table(rows=3, cols=3)
    banner = table.rows[0].cells[0].merge(table.rows[0].cells[2])
    banner.text = "DADOS GERAIS DO PROCESSO"
    table.rows[1].cells[0].text = "☑"
    table.rows[1].cells[1].text = "N° PROCESSO"
    table.rows[1].cells[2].text = "125/2026"
    table.rows[2].cells[0].text = "☑"
    table.rows[2].cells[1].text = "VALOR TOTAL ESTIMADO"
    table.rows[2].cells[2].text = "R$ 60.000,00"
    path = tmp_path / "aviso.docx"
    document.save(path)
    return path


def test_table_content_survives_the_import(tmp_path):
    cfg = convert(
        _doc_with_table(tmp_path),
        {"125/2026": "numero_processo", "R$ 60.000,00": "valor_total_estimado"},
        "Aviso de Dispensa",
        document_type="licitacao",
        document_title="AVISO DE DISPENSA",
    )
    html = "".join(s.template_html for s in cfg.sections)
    assert "<table" in html
    assert "DADOS GERAIS DO PROCESSO" in html
    assert "{{numero_processo}}" in html and "{{valor_total_estimado}}" in html
    assert {f.key for f in cfg.fields} == {"numero_processo", "valor_total_estimado"}
    assert cfg.scope_document_type == "licitacao"


def test_merged_banner_becomes_a_single_cell_with_colspan(tmp_path):
    """python-docx repete a célula mesclada; sem colspan a faixa sairia 3x."""
    document = docx.Document(str(_doc_with_table(tmp_path)))
    html = table_html(document.tables[0], {})
    assert html.count("DADOS GERAIS DO PROCESSO") == 1
    assert 'colspan="3"' in html


def test_paragraphs_outside_the_table_keep_their_place(tmp_path):
    cfg = convert(_doc_with_table(tmp_path), {}, "Aviso de Dispensa")
    html = "".join(s.template_html for s in cfg.sections)
    assert html.index("torna público") < html.index("<table")


def test_shading_and_column_widths_come_from_the_docx(tmp_path):
    """A faixa colorida e a largura da coluna do "☑" fazem parte do quadro."""
    document = docx.Document(str(_doc_with_table(tmp_path)))
    table = document.tables[0]
    shd = docx.oxml.parse_xml(
        '<w:shd xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
        ' w:val="clear" w:fill="FFF2CC"/>'
    )
    table.rows[0].cells[0]._tc.get_or_add_tcPr().append(shd)
    html = table_html(table, {})
    assert "background-color:#FFF2CC" in html
    assert "<colgroup>" in html and "width:" in html


def test_legacy_doc_is_rejected_with_a_useful_message(tmp_path):
    """.doc (Word 97-2003) não é legível: o erro precisa dizer o que fazer."""
    legacy = tmp_path / "homologacao.doc"
    legacy.write_bytes(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 64)
    with pytest.raises(ValueError, match="Salvar como"):
        convert(legacy, {}, "Homologação")


def test_longest_replacement_wins_over_the_one_inside_it(tmp_path):
    """"7.000,00" está dentro de "R$ 7.000,00": vence o trecho mais específico."""
    document = docx.Document()
    document.add_paragraph("Valor Total: R$ 7.000,00 (Sete Mil Reais).")
    document.add_paragraph("Unitário: 7.000,00")
    path = tmp_path / "termo.docx"
    document.save(path)

    cfg = convert(path, {
        "7.000,00": "valor_unitario",
        "R$ 7.000,00 (Sete Mil Reais)": "valor_total_extenso",
    }, "Termo")
    html = "".join(s.template_html for s in cfg.sections)
    assert "{{valor_total_extenso}}" in html
    assert "Unitário: {{valor_unitario}}" in _text(html)
    assert "R$" not in _text(html).split("Unitário")[0].replace("Valor Total:", "")


def _text(html: str) -> str:
    import re as _re
    return _re.sub(r"<[^>]+>", "", html)


def test_cell_borders_follow_the_docx_side_by_side(tmp_path):
    """O termo de homologação só tem linhas horizontais: nada de grade cheia."""
    document = docx.Document()
    table = document.add_table(rows=1, cols=2)
    borders = docx.oxml.parse_xml(
        '<w:tcBorders xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        '<w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="nil"/>'
        '<w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="nil"/>'
        "</w:tcBorders>"
    )
    table.rows[0].cells[0]._tc.get_or_add_tcPr().append(borders)
    html = table_html(table, {})
    assert "border-top:0.5pt solid #000" in html
    assert "border-left:none" in html and "border-right:none" in html


def test_cells_without_declared_borders_keep_the_default_grid(tmp_path):
    document = docx.Document()
    table = document.add_table(rows=1, cols=2)
    assert "border:0.75pt solid #000" in table_html(table, {})
