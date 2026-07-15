"""Conversão da evolução (HTML do editor rich-text) para texto legível no PDF."""

from app.services.prontuario_pdf import evolucao_para_texto


def test_texto_puro_passa_intacto():
    assert evolucao_para_texto("Evolução simples.") == "Evolução simples."
    assert evolucao_para_texto(None) is None
    assert evolucao_para_texto("") == ""


def test_remove_tags_e_decodifica_entidades():
    html = "<p>testando novamente mais uma a\u00e7\u00e3o&nbsp; fim</p>"
    assert evolucao_para_texto(html) == "testando novamente mais uma a\u00e7\u00e3o fim"


def test_preserva_quebras_de_paragrafo():
    html = "<p>linha um</p><p>linha dois</p><br><div>linha tr\u00eas</div>"
    out = evolucao_para_texto(html)
    assert out is not None
    assert "linha um" in out and "linha dois" in out and "linha tr\u00eas" in out
    assert out.count("\n") >= 2


def test_formatacao_inline_vira_texto():
    html = "<p><b>negrito</b> e <i>it\u00e1lico</i> &amp; entidades</p>"
    assert evolucao_para_texto(html) == "negrito e it\u00e1lico & entidades"
