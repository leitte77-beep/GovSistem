"""Padrão de diagramação do Diário aplicado sozinho (sem o operador formatar).

Referência: o diário que Farol diagramava no Word (doemunicipal.com.br) —
súmula recuada em negrito e caixa alta, preâmbulo em negrito e caixa alta,
assinatura com o nome em caixa alta, extratos com rótulo em negrito, atos
agrupados em seções, sem cabeçalho de outro diário nem título repetido.
"""

from types import SimpleNamespace

from app.document_model.body_html import _style_attr, humanize_header, table_html
from app.semantic.parser import _is_masthead, parse_document
from app.semantic.renderer import _bold_field_label, render_document
from app.semantic.snapshot import derive_semantic_from_matter
from app.services.edition_pdf import _default_section, _institutional_css


def _types(doc):
    return [b.type for b in doc.blocks]


# ── Parser ───────────────────────────────────────────────────────────────────

def test_pasted_masthead_of_another_diary_is_removed_and_reported():
    doc = parse_document(
        html=(
            "<h1>DIÁRIO OFICIAL ELETRÔNICO<br>ANO: <br>EDIÇÃO Nº: Pág.(s)<br>MUNICÍPIO DE Farol</h1>"
            "<p>Art. 1º Fica aberto crédito.</p>"
        ),
        title="DECRETO",
    )
    assert "heading" not in _types(doc)
    assert any(a["action"] == "removed_masthead" for a in doc.auto_adjustments)


def test_sentence_citing_the_diary_is_kept():
    doc = parse_document(
        html="<p>Esta Portaria entra em vigor na data de sua publicação.</p>"
             "<p>Diário Oficial do Município, edição nº 52, de 15 de setembro de 2026, "
             "publicou o extrato do contrato firmado entre as partes, com vigência de um ano.</p>",
        title="PORTARIA",
    )
    assert len(doc.blocks) == 2


def test_is_masthead_ignores_accents_and_case():
    assert _is_masthead("DIÁRIO OFICIAL ELETRÔNICO ANO: EDIÇÃO Nº: Pág.(s)")
    assert not _is_masthead("Art. 1º Fica aberto crédito no Diário Oficial")


def test_heading_repeating_the_published_title_with_number_is_removed():
    matter = SimpleNamespace(
        content_mode="rich_text",
        content_html="<h1>DECRETO Nº 2748/2026</h1><p>Art. 1º Fica aberto crédito.</p>",
        title="DECRETO", summary="", act_number="2748", act_year=2026,
    )
    doc = derive_semantic_from_matter(matter)
    assert "heading" not in _types(doc)


def test_heading_with_line_breaks_keeps_words_apart():
    doc = parse_document(html="<h2>EXTRATO DO CONTRATO<br>Nº 88/2026</h2><p>x.</p>", title="")
    assert doc.blocks[0].text == "EXTRATO DO CONTRATO Nº 88/2026"


def test_model_signature_in_nested_divs_becomes_name_and_role():
    doc = parse_document(
        html=(
            "<p>Objeto do Licitação, Pregão</p><div class=\"doc-signature\">"
            "<div class=\"sign-entry\"><div class=\"sign-line\"></div>"
            "<div class=\"sign-name\">OCLECIO DE FREITAS MENESES</div>"
            "<div class=\"sign-role\">Prefeito Municipal</div></div></div>"
        ),
        title="TERMO",
    )
    signature = next(b for b in doc.blocks if b.type == "signature_block")
    assert signature.entries[0].name == "OCLECIO DE FREITAS MENESES"
    assert signature.entries[0].role == "Prefeito Municipal"


# ── Renderizador ─────────────────────────────────────────────────────────────

def test_house_style_for_summary_preamble_and_signature():
    doc = parse_document(
        html=(
            "<p>SÚMULA: abre crédito adicional suplementar.</p>"
            "<p>O PREFEITO DO MUNICÍPIO DE FAROL, no uso de suas atribuições legais,</p>"
            "<p>DECRETA:</p><p>Art. 1º Fica aberto crédito.</p>"
        ),
        title="DECRETO",
    )
    html = render_document(doc, media="print", include_title=False)
    css = html[html.index("<style>"):]
    summary_rule = css[css.index(".doe-document .doe-summary"):].split("}")[0]
    assert "font-weight: bold" in summary_rule
    assert "text-transform: uppercase" in summary_rule
    assert "italic" not in summary_rule
    assert "margin: 0.4em 0 1.2em 35%" in summary_rule
    preamble_rule = css[css.index(".doe-block--preamble {"):].split("}")[0]
    assert "font-weight: bold" in preamble_rule and "uppercase" in preamble_rule
    sign_rule = css[css.index(".doe-signature .doe-sign-name"):].split("}")[0]
    assert "uppercase" in sign_rule


def test_extract_field_label_is_bold():
    assert _bold_field_label("CONTRATANTE: Município de Farol") == (
        "<strong>CONTRATANTE:</strong> Município de Farol"
    )
    # Formatação do autor prevalece.
    assert _bold_field_label("<em>OBJETO</em>: x") == "<em>OBJETO</em>: x"


# ── Seções e layout ──────────────────────────────────────────────────────────

def _item(act_type="", title=""):
    return {"title": title, "metadata": {"act_type_name": act_type}}


def test_acts_are_grouped_in_sections_like_the_word_diary():
    assert _default_section(_item("Decreto", "DECRETO")) == "DECRETOS"
    assert _default_section(_item("Lei", "LEI COMPLEMENTAR")) == "LEIS"
    assert _default_section(_item("Portaria", "PORTARIA")) == "PORTARIAS"
    assert _default_section(_item("Contrato", "EXTRATO DO CONTRATO")) == "PROCESSOS DE COMPRAS"
    assert _default_section(_item("Licitação", "AVISO")) == "PROCESSOS DE COMPRAS"
    assert _default_section(_item("Outros", "Termo de Adjudicação e Homologação")) == "PROCESSOS DE COMPRAS"
    assert _default_section(_item("Outros", "PORTARIA DE FÉRIAS")) == "PORTARIAS"
    assert _default_section(_item("Outros", "Comunicado")) == "OUTROS ATOS"


def test_traditional_layout_keeps_its_own_page_geometry():
    org = SimpleNamespace(institutional_layout={
        "margins": {"top": 20, "left": 18, "right": 18, "bottom": 20},
        "body_font": {"size": 12.0, "color": "#000000", "family": "Times New Roman", "line_height": 1.5},
        "page_size": "A4", "orientation": "portrait",
        "accent_color": "#001631", "background_color": "#FFFFFF",
    })
    owned = _institutional_css(org, layout_owns_page=True)
    assert "@page" not in owned and "#001631" not in owned
    assert "Times New Roman" in owned
    assert "@page" in _institutional_css(org)


# ── Modelos documentais (IA) ─────────────────────────────────────────────────

def test_model_style_does_not_force_normal_weight_or_case():
    css = _style_attr({"alignment": "justify", "font_weight": "normal", "uppercase": False})
    assert "font-weight" not in css and "text-transform" not in css
    assert "text-align:justify" in css
    bold = _style_attr({"alignment": "center", "font_weight": "bold", "uppercase": True})
    assert "font-weight:bold" in bold and "text-transform:uppercase" in bold


def test_model_table_widths_are_normalized_and_headers_humanized():
    block = SimpleNamespace(
        column_widths=[5, 5, 30, 15, 5, 8, 10, 12, 20],  # 110%
        headers=["lote", "Valor_Unitario", "{{campo_x}}"],
        rows=[],
    )
    html = table_html(block)
    import re
    widths = [float(w) for w in re.findall(r"width:([\d.]+)%", html)]
    assert abs(sum(widths) - 100) < 0.1
    assert "Valor Unitario" in html and "{{campo_x}}" in html
    assert humanize_header("Valor_Total") == "Valor Total"


def test_learning_drops_masthead_section():
    from app.document_model.learning import _repair_config

    data = {
        "document_title": "Termo",
        "sections": [
            {"id": "s1", "kind": "heading", "text": "DIÁRIO OFICIAL ELETRÔNICO ANO: EDIÇÃO Nº: Pág.(s)"},
            {"id": "s2", "kind": "paragraph", "text": "Adjudicando e Homologando o procedimento."},
        ],
    }
    texts = [s["text"] for s in _repair_config(data, "outros")["sections"]]
    assert texts == ["Adjudicando e Homologando o procedimento."]
