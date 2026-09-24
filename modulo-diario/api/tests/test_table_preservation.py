"""Quadros diagramados (modelo Word) sobrevivem ao pipeline de publicação."""
from __future__ import annotations

from app.semantic.parser import parse_document
from app.semantic.renderer import render_document

QUADRO = (
    '<table style="width:100%;border-collapse:collapse;table-layout:fixed">'
    '<colgroup><col style="width:3%"/><col style="width:20%"/><col style="width:77%"/></colgroup>'
    '<tbody>'
    '<tr><td style="border:0.75pt solid #000;background-color:#FFF2CC" colspan="3">'
    '<p style="text-align:left"><span style="font-family:Arial;font-size:11pt">'
    '<strong>DADOS GERAIS DO PROCESSO</strong></span></p></td></tr>'
    '<tr><td style="border:0.75pt solid #000">☑</td>'
    '<td style="border:0.75pt solid #000"><p><strong>N° PROCESSO</strong></p></td>'
    '<td style="border:0.75pt solid #000"><p>125/2026</p></td></tr>'
    '<tr><td style="border:0.75pt solid #000" colspan="3">'
    '<p>DOUGLAS JOSE LAQUIAS</p><p>SECRETARIO</p><p>ÓRGÃO REQUERENTE</p></td></tr>'
    '</tbody></table>'
)

PLANILHA = (
    "<table><thead><tr><th>Rubrica</th><th>Valor</th></tr></thead>"
    "<tbody><tr><td>Obras</td><td>800.000,00</td></tr></tbody></table>"
)


def _block_types(html: str, **kw):
    return parse_document(html=html, title=kw.get("title", "AVISO"), summary="")


def test_formatted_quadro_keeps_its_own_layout():
    doc = _block_types(QUADRO)
    block = doc.blocks[0]
    assert block.metadata.get("kind") == "table_html"
    html = render_document(doc, None, media="screen", include_title=False,
                           include_style=False)
    assert "background-color:#FFF2CC" in html
    assert "<strong>DADOS GERAIS DO PROCESSO</strong>" in html
    assert "colgroup" in html and 'colspan="3"' in html


def test_cell_paragraphs_are_not_glued_together():
    doc = _block_types(QUADRO)
    text = doc.plain_text()
    assert "LAQUIASSECRETARIO" not in text
    assert "DOUGLAS JOSE LAQUIAS" in text and "SECRETARIO" in text


def test_plain_data_table_still_gets_semantic_diagramming():
    """Tabela sem formatação própria (import de PDF) segue pelo caminho semântico."""
    doc = _block_types(PLANILHA)
    table = next(b for b in doc.blocks if b.type == "table")
    assert any(cell.header for row in table.rows for cell in row)
    assert "800.000,00" in doc.plain_text()
