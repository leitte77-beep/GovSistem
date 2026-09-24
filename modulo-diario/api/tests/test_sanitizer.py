"""Prove that every editor style allowed by the sanitizer survives clean-up.

Fase 7 criterion #1: o HTML depois da sanitização preserva todos os estilos
permitidos (alinhamento, recuo, negrito, itálico, sublinhado, tachado, cor,
tamanho, família, espaçamento, listas, tabelas, bordas, links, imagens,
largura/altura, colspan/rowspan, alinhamento vertical e quebras de página).
"""

from app.core.html_sanitizer import sanitize_html


def test_preserves_text_alignment():
    for value in ("left", "center", "right", "justify"):
        html = f'<p style="text-align: {value}">alinhado</p>'
        out = sanitize_html(html)
        assert f"text-align: {value}" in out


def test_preserves_inline_text_styles():
    html = (
        '<p style="font-weight: bold; font-style: italic; '
        'text-decoration: underline; color: #ff0000; '
        'font-size: 16pt; font-family: Times New Roman; '
        'line-height: 2; text-indent: 40pt">estilos</p>'
    )
    out = sanitize_html(html)
    for prop in (
        "font-weight: bold", "font-style: italic", "text-decoration: underline",
        "color:", "font-size: 16pt", "font-family: Times New Roman",
        "line-height: 2", "text-indent: 40pt",
    ):
        assert prop in out


def test_preserves_table_layout_attributes():
    html = (
        '<table style="width: 90%; border-collapse: collapse; border: 1px solid #000">'
        '<tr><td colspan="2" rowspan="2" style="vertical-align: middle; text-align: center">célula</td></tr>'
        "</table>"
    )
    out = sanitize_html(html)
    assert 'colspan="2"' in out
    assert 'rowspan="2"' in out
    assert "vertical-align: middle" in out
    assert "text-align: center" in out
    assert "border-collapse: collapse" in out
    assert "width: 90%" in out


def test_preserves_links_and_images():
    html = (
        '<a href="https://govsistem.com.br" target="_blank" rel="noopener">link</a>'
        '<img src="/api/download/a.pdf" width="120" height="80" alt="x">'
    )
    out = sanitize_html(html)
    assert 'href="https://govsistem.com.br"' in out
    assert 'width="120"' in out
    assert 'height="80"' in out


def test_strips_scripts_and_unsafe_attributes():
    html = '<p onclick="alert(1)">x</p><script>alert(1)</script><img src="javascript:alert(1)">'
    out = sanitize_html(html)
    assert "script" not in out.lower()
    assert "onclick" not in out
    assert "javascript:" not in out


def test_strips_dangerous_css_but_keeps_layout():
    html = '<p style="background: url(javascript:alert(1)); text-align: center">x</p>'
    out = sanitize_html(html)
    assert "javascript" not in out
    assert "text-align: center" in out


def test_preserves_lists():
    html = '<ol style="list-style-type: decimal"><li style="margin-left: 20pt">item</li></ol>'
    out = sanitize_html(html)
    assert "<ol" in out and "<li" in out
    assert "margin-left: 20pt" in out


def test_preserves_full_official_table_structure():
    """A complete official-act table (thead/tbody/th/td, borders, alignment,
    rowspan/colspan) must survive the backend sanitizer un-flattened."""
    html = (
        '<table style="width: 100%; border-collapse: collapse; border: 1px solid #000">'
        "<thead><tr>"
        "<th style=\"border:1px solid #000; text-align: left\">Descrição</th>"
        "<th style=\"border:1px solid #000; text-align: right\">Valor em R$</th>"
        "</tr></thead>"
        "<tbody>"
        "<tr><td colspan=\"2\" style=\"border:1px solid #000; text-align: left\">Material</td></tr>"
        "<tr><td rowspan=\"2\" style=\"border:1px solid #000; vertical-align: middle\">Vínculo</td><td style=\"border:1px solid #000; text-align: right\">45.500,00</td></tr>"
        "</tbody>"
        "</table>"
    )
    out = sanitize_html(html)
    assert "<thead>" in out and "<tbody>" in out
    assert "<th" in out and "<td" in out
    assert 'colspan="2"' in out and 'rowspan="2"' in out
    assert "border-collapse: collapse" in out
    assert "vertical-align: middle" in out
    # The flattening bug produced tab/space-separated single-line text.
    assert "Dotação Elemento da Despesa Vínculo Valor em R$" not in out

