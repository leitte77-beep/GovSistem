from app.semantic.parser import _explicit_spacing, parse_document
from app.semantic.renderer import render_document


def _render(html: str) -> str:
    doc = parse_document(html=html, title="DECRETO Nº 1/2026", document_type="decreto")
    return render_document(doc)


def test_espacamento_do_editor_chega_na_publicacao():
    out = _render('<p style="line-height: 1.5; margin-top: 0; margin-bottom: 12pt">Texto comum do ato com espaçamento escolhido.</p>')
    assert "line-height: 1.5" in out
    assert "margin-bottom: 12pt" in out


def test_valores_fora_do_limite_ou_livres_sao_ignorados():
    spacing = _explicit_spacing('<p style="line-height: 9; margin-bottom: 300pt">x</p>')
    assert "line_height" not in spacing and "margin_bottom" not in spacing
    assert "line_height" not in _explicit_spacing('<p style="line-height: expression(x)">x</p>')
    assert _explicit_spacing('<p style="margin-bottom: 0">x</p>')["margin_bottom"] == "0pt"


def test_paragrafo_sem_recuo_no_editor_sai_sem_recuo():
    """Laudo 55/2026: sem recuo no editor, a publicação punha 1,25 cm."""
    out = _render('<p style="text-align: justify;">ANÁLISE PELA EQUIPE TÉCNICA DO MUNICÍPIO DE FAROL, conforme o edital.</p>')
    assert "text-indent: 0" in out


def test_recuo_do_editor_e_mantido():
    out = _render('<p style="text-indent: 2cm; text-align: justify;">Fica instituído o programa municipal de apoio ao produtor.</p>')
    assert "text-indent: 2cm" in out
    assert _explicit_spacing('<p style="text-indent: expression(x)">x</p>')["text_indent"] == "0"


def test_sumula_acompanha_entrelinha_do_texto():
    """Decreto 2753/2026: corpo em entrelinha 1 e súmula espaçada."""
    html = (
        '<p style="line-height: 1;">SÚMULA: DISPÕE SOBRE O CANCELAMENTO TOTAL DA ATA DE REGISTRO DE PREÇOS Nº 73/2026.</p>'
        '<p style="line-height: 1;">O PREFEITO DO MUNICÍPIO DE FAROL, NO USO DAS ATRIBUIÇÕES QUE LHE CONFERE A LEI, DECRETA:</p>'
        '<p style="line-height: 1;">Art. 1º Fica cancelada a ata de registro de preços.</p>'
    )
    out = _render(html)
    assert '<p class="doe-summary" style="line-height: 1">' in out
