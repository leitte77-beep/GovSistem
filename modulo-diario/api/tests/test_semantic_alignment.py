"""Alinhamento escolhido no editor sobrevive à diagramação da publicação.

Caso real (Portaria 247/2026, edição 54): "Paço Municipal…" e o local/data
estavam centralizados no editor e saíram justificados/recuados no Diário.
"""

from app.semantic import parser
from app.semantic.renderer import render_document

HTML = (
    "<p><strong>PREFEITO DO MUNICIPIO DE FAROL, NO USO DE SUAS ATRIBUIÇÕES;</strong></p>"
    "<p>Considerando o requerimento sob o protocolo nº 303;</p>"
    '<p style="text-align: center;"><strong>RESOLVE:</strong></p>'
    "<p>I – Exonerar, a pedido, o servidor <strong>FULANO</strong>.</p>"
    "<p>II – Esta Portaria entra em vigor na data de sua publicação.</p>"
    '<p style="text-align: center;"><strong>Paço Municipal “José Semiguem”</strong></p>'
    '<p style="text-align: center;">Farol, 16 de outubro de 2026.</p>'
    '<p style="text-align: right;">Texto à direita.</p>'
    "<p>Parágrafo comum sem alinhamento.</p>"
)


def test_parser_keeps_center_and_right_alignment():
    doc = parser.parse_document(html=HTML, title="PORTARIA Nº 247/2026", document_type="portaria")
    aligns = {
        (getattr(b, "content", None) or getattr(b, "text", "") or ""): (b.metadata or {}).get("align")
        for b in doc.blocks
    }
    paco = next(v for k, v in aligns.items() if "Paço Municipal" in k)
    data = next(v for k, v in aligns.items() if "Farol, 16 de outubro" in k)
    direita = next(v for k, v in aligns.items() if "Texto à direita" in k)
    comum = next(v for k, v in aligns.items() if "Parágrafo comum" in k)
    assert paco == "center"
    assert data == "center"
    assert direita == "right"
    assert comum is None


def test_renderer_applies_alignment_class():
    doc = parser.parse_document(html=HTML, title="PORTARIA Nº 247/2026", document_type="portaria")
    html = render_document(doc, None, media="screen", include_title=False)
    paco_div = html[: html.index("Paço Municipal")].rsplit("<div", 1)[1]
    assert "doe-align-center" in paco_div
    assert ".doe-document .doe-align-center" in html  # CSS enviado junto


def test_alignment_ignores_other_values_and_inner_tags():
    assert parser._explicit_alignment('<p style="text-align: justify;">x</p>') is None
    assert parser._explicit_alignment('<p style="text-align:left">x</p>') is None
    assert parser._explicit_alignment('<p align="center">x</p>') == "center"
    # Só vale o alinhamento do próprio parágrafo, não de um span interno.
    assert parser._explicit_alignment('<p><span style="text-align:center">x</span></p>') is None
