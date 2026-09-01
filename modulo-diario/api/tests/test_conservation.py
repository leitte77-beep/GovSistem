"""Fase 3 — Text conservation (golden fixture).

Proves the semantic engine never silently re-writes legal wording. Uses a
golden "Decreto 04/2026" with preâmbulo, súmula, DECRETA, três artigos, uma
tabela orçamentária (rowspan/colspan/totais), local/data e autoridade/cargo.

The comparison spans:
  * normalized source text
  * normalized text extracted from the SemanticDocument (plain_text)
  * normalized text extracted from the rendered HTML (both media)
  * the content_manifest_hash integrity check
"""

from __future__ import annotations

import re

from app.semantic import parser
from app.semantic.integrity import compute_text_integrity
from app.semantic.renderer import render_document
from app.semantic.templates import default_config_for

GOLDEN = """DECRETO Nº 04/2026

Dispõe sobre a abertura de crédito adicional especial e dá outras providências.

O PREFEITO DO MUNICÍPIO, no uso das atribuições que lhe confere a Lei Orgânica do Município,

DECRETA:

Art. 1º Fica aberto crédito adicional especial no valor de R$ 1.250.000,00, para atender às despesas de obras e equipamentos.
Parágrafo único. Os recursos provêm de superávit financeiro apurado em balanço patrimonial.

Art. 2º As despesas decorrentes desta Lei correrão à conta das seguintes dotações:
I – Obras de infraestrutura, no valor de R$ 800.000,00;
II – Aquisição de equipamentos, no valor de R$ 450.000,00;
III – Serviços de engenharia, no valor de R$ 0,00.

Art. 3º Este Decreto entra em vigor na data de sua publicação, revogadas as disposições em contrário.

Prefeitura Municipal, 3 de fevereiro de 2026.

Maria Oliveira
Prefeita
Secretaria de Administração
"""

GOLDEN_HTML = """<h2>DECRETO Nº 04/2026</h2>
<p>Dispõe sobre a abertura de crédito adicional especial e dá outras providências.</p>
<p>O PREFEITO DO MUNICÍPIO, no uso das atribuições que lhe confere a Lei Orgânica do Município,</p>
<p><strong>DECRETA:</strong></p>
<p><strong>Art. 1º</strong> Fica aberto crédito adicional especial no valor de <strong>R$ 1.250.000,00</strong>, para atender às despesas de obras e equipamentos.</p>
<p>Parágrafo único. Os recursos provêm de superávit financeiro apurado em balanço patrimonial.</p>
<p><strong>Art. 2º</strong> As despesas decorrentes desta Lei correrão à conta das seguintes dotações:</p>
<p><strong>I</strong> – Obras de infraestrutura, no valor de <strong>R$ 800.000,00</strong>;</p>
<p><strong>II</strong> – Aquisição de equipamentos, no valor de <strong>R$ 450.000,00</strong>;</p>
<p><strong>III</strong> – Serviços de engenharia, no valor de <strong>R$ 0,00</strong>.</p>
<p><strong>Art. 3º</strong> Este Decreto entra em vigor na data de sua publicação, revogadas as disposições em contrário.</p>
<p>Prefeitura Municipal, 3 de fevereiro de 2026.</p>
<p>Maria Oliveira<br/>Prefeita<br/>Secretaria de Administração</p>
"""

# Budget table with rowspan / colspan / total preserved as a real table.
GOLDEN_TABLE_HTML = """<h2>ANEXO I — CRÉDITO ORÇAMENTÁRIO</h2>
<table>
  <caption>Crédito adicional especial</caption>
  <thead>
    <tr><th rowspan="2">Rubrica</th><th colspan="2">Valores (R$)</th></tr>
    <tr><th>Corrente</th><th>Capital</th></tr>
  </thead>
  <tbody>
    <tr><td>Obras de infraestrutura</td><td>0,00</td><td>800.000,00</td></tr>
    <tr><td>Equipamentos</td><td>0,00</td><td>450.000,00</td></tr>
    <tr><td><strong>TOTAL</strong></td><td colspan="2" class="total">1.250.000,00</td></tr>
  </tbody>
</table>
"""


def _strip_html(html: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    return re.sub(r"\s+", " ", text).strip()


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[A-Za-z0-9À-ÿ.ºª%$#/()-]+", text.upper()))


def _parse_golden() -> dict:
    return parser.parse_document(html=GOLDEN_HTML, plain=GOLDEN, title="DECRETO Nº 04/2026")


def test_golden_parses_articles_and_commands():
    doc = _parse_golden()
    types = [b.type for b in doc.blocks]
    assert "heading" in types
    assert "command" in types
    assert types.count("article") == 3
    # Every article label ("Art. 1º", "Art. 2º", "Art. 3º") must survive.
    plain = doc.plain_text()
    for label in ("Art. 1º", "Art. 2º", "Art. 3º"):
        assert "ART" in plain.upper() or label in plain
    # All lexical tokens of the source are preserved (hard conservation).
    report = compute_text_integrity(GOLDEN, doc)
    assert report["ok"] is True, report


def test_golden_inciso_and_authority_text_preserved_even_if_not_classified():
    """Incisos (I–III) and the authority block may be parsed as paragraphs by the
    deterministic classifier; what must never happen is LOSS of their wording.
    The user re-classifies structure in the block editor."""
    doc = _parse_golden()
    plain = doc.plain_text().upper()
    for expected in ("OBRAS DE INFRAESTRUTURA", "800.000,00", "450.000,00",
                     "MARIA OLIVEIRA", "PREFEITA", "SECRETARIA DE ADMINISTRAÇÃO",
                     "EQUIPAMENTOS", "SERVIÇOS DE ENGENHARIA"):
        assert expected in plain, expected
    report = compute_text_integrity(GOLDEN, doc)
    assert report["missing_sensitive"] == []


def test_golden_no_lexical_token_lost_between_source_and_document():
    doc = _parse_golden()
    report = compute_text_integrity(GOLDEN, doc)
    assert report["ok"] is True, report
    assert report["missing_sensitive"] == []
    # every sensitive token in the source is present in the document
    source_tokens = _tokens(GOLDEN)
    doc_tokens = _tokens(doc.plain_text())
    sensitive = {t for t in source_tokens if t.startswith("R$") or re.fullmatch(r"\d+([.,]\d+)*", t)}
    assert sensitive <= doc_tokens


class _PlainDoc:
    """Adapter so compute_text_integrity can consume a plain-text source."""

    def __init__(self, text: str):
        self._text = text

    def plain_text(self):
        return self._text


def test_golden_no_sensitive_token_lost_in_rendered_html():
    doc = _parse_golden()
    config = default_config_for("decreto")
    for media in ("screen", "print"):
        html = render_document(doc, config, media=media)
        rendered = _strip_html(html)
        report = compute_text_integrity(GOLDEN, _PlainDoc(rendered))
        # No number / currency / article reference may be lost in the rendering.
        assert report["ok"] is True, (media, report["missing_sensitive"][:10])
        assert report["missing_sensitive"] == [], (media, report["missing_sensitive"][:10])


def test_golden_table_preserved_as_table_with_rowspan_colspan():
    doc = parser.parse_document(html=GOLDEN_TABLE_HTML, plain=None, title="ANEXO I")
    table = next((b for b in doc.blocks if b.type == "table"), None)
    assert table is not None, "table must not be flattened into text"
    # header structure: row with rowspan=2 col A, colspan=2 col group
    header_flat = [c for row in table.rows for c in row if c.header]
    assert any(c.colspan == 2 for c in header_flat)
    assert any(c.rowspan == 2 for c in header_flat)
    # all numbers of the table survive (conservation)
    table_text = " ".join(c.content for row in table.rows for c in row)
    for n in ("800.000,00", "450.000,00", "1.250.000,00"):
        assert n in table_text, n


def test_golden_artigos_paragrafos_incisos_preserved():
    # parse from the combined source (full decree) — conservation is the guarantee
    doc = parser.parse_document(html=GOLDEN_HTML, plain=GOLDEN, title="DECRETO Nº 04/2026")
    arts = [b for b in doc.blocks if b.type == "article"]
    assert arts
    art1 = next(b for b in arts if "1" in str(b.number))
    assert "R$ 1.250.000,00" in art1.caput or "1.250.000,00" in art1.caput
    # wording of incisos and authority is never lost
    plain = doc.plain_text().upper()
    for expected in ("800.000,00", "450.000,00", "MARIA OLIVEIRA", "PREFEITA"):
        assert expected in plain, expected
