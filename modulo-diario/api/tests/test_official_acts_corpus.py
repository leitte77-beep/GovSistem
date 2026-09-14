"""Golden corpus for the official acts the municipality publishes.

Each fixture is plain text (what a secretary would paste). Tests assert the
deterministic engine recognizes the structure and never loses sensitive tokens.
This is the regression net for auto-diagramming across act types.
"""

from app.semantic.integrity import compute_text_integrity
from app.semantic.parser import parse_document

LEI = """LEI Nº 1.234/2026

Dispõe sobre a criação do Programa Municipal de Incentivo à Cultura.

O PREFEITO MUNICIPAL DE FAROL, no uso de suas atribuições legais, faço saber
que a Câmara Municipal aprovou e eu sanciono a seguinte Lei:

Art. 1º Fica criado o Programa Municipal de Incentivo à Cultura.
Parágrafo único. O programa será coordenado pela Secretaria de Cultura.
Art. 2º As despesas correrão por conta de dotação orçamentária própria.
Art. 3º Esta Lei entra em vigor na data de sua publicação.

Paço Municipal de Farol, 10 de março de 2026.

José da Silva
Prefeito Municipal
"""

DECRETO = """DECRETO Nº 045/2026

Dispõe sobre a abertura de crédito adicional suplementar.

O PREFEITO MUNICIPAL DE FAROL, no uso de suas atribuições legais,

DECRETA:

Art. 1º Fica aberto crédito adicional suplementar no valor de R$ 250.000,00.
§ 1º Os recursos provêm de anulação parcial de dotação.
I - da Secretaria de Obras;
II - da Secretaria de Educação.
Art. 2º Este Decreto entra em vigor na data de sua publicação.

Farol, 12 de abril de 2026.

José da Silva
Prefeito Municipal
"""

EDITAL = """EDITAL DE PREGÃO ELETRÔNICO Nº 002/2026

O MUNICÍPIO DE FAROL torna público o presente Edital de licitação.

1. DO OBJETO
O objeto da presente licitação é a aquisição de material de escritório.

Item\tDescrição\tQuantidade\tValor
1\tCaneta esferográfica\t100\t150,00
2\tPapel A4 (resma)\t50\t1.250,00

Farol, 20 de agosto de 2026.

Maria Souza
Secretária de Administração
"""

EXTRATO_CONTRATO = """EXTRATO DE CONTRATO Nº 045/2026

Contratante: PREFEITURA MUNICIPAL DE FAROL, CNPJ 95.640.124/0001-48
Contratada: EMPRESA XYZ LTDA, CNPJ 12.345.678/0001-90
Objeto: Aquisição de material de escritório
Valor global: R$ 45.500,00
Vigência: 12 meses a contar da assinatura
Fundamento legal: Lei nº 14.133/2021

Farol, 15 de julho de 2026.

José da Silva
Prefeito Municipal
"""

TABELA_LONGA = (
    "Item\tDescrição\tUnidade\tQuantidade\tValor unitário\tValor total\n"
    + "".join(
        f"{i}\tBucha de Redução soldável 32x25mm\tUN\t30.000\t1,1800\t35,4000\n"
        for i in range(1, 41)
    )
)


def _blocks(doc):
    return [b.type for b in doc.blocks]


def _integrity_ok(source, doc):
    return compute_text_integrity(source, doc)["missing_sensitive"] == []


def test_lei_structure_and_signature():
    doc = parse_document(plain=LEI, title="LEI Nº 1.234/2026")
    types = _blocks(doc)
    assert types[0] == "heading"
    assert types.count("article") == 3
    assert "signature_block" in types
    sig = next(b for b in doc.blocks if b.type == "signature_block")
    assert sig.entries[0].name == "José da Silva"
    assert "Prefeito" in sig.entries[0].role
    assert "Paço Municipal" in sig.entries[0].location


def test_decreto_structure_with_paragraph_and_incisos():
    doc = parse_document(plain=DECRETO, title="DECRETO Nº 045/2026")
    types = _blocks(doc)
    assert "command" in types
    art = next(b for b in doc.blocks if b.type == "article")
    assert art.paragraphs  # § 1º attached
    assert [i.number for i in art.incisos] == ["I", "II"]
    assert "signature_block" in types


def test_edital_with_table_and_signature():
    doc = parse_document(plain=EDITAL, title="EDITAL DE PREGÃO ELETRÔNICO Nº 002/2026")
    types = _blocks(doc)
    assert "table" in types
    table = next(b for b in doc.blocks if b.type == "table")
    assert table.headers == ["Item", "Descrição", "Quantidade", "Valor"]
    assert len(table.rows) >= 2
    assert "signature_block" in types


def test_extrato_contrato_preserves_fields_and_signature():
    doc = parse_document(plain=EXTRATO_CONTRATO, title="EXTRATO DE CONTRATO Nº 045/2026")
    types = _blocks(doc)
    assert "signature_block" in types
    assert _integrity_ok(EXTRATO_CONTRATO, doc)
    text = doc.plain_text()
    for token in ["95.640.124/0001-48", "12.345.678/0001-90", "45.500,00", "14.133/2021"]:
        assert token in text


def test_large_tab_table_has_header_and_widths():
    doc = parse_document(plain=TABELA_LONGA, title="Relação de materiais")
    table = next(b for b in doc.blocks if b.type == "table")
    assert table.headers[:2] == ["Item", "Descrição"]
    assert len(table.rows) == 40
    assert len(table.column_widths) == 6
    assert abs(sum(table.column_widths) - 100.0) < 0.5


def test_anexo_reference_preserved():
    text = (
        "PORTARIA Nº 10/2026\n\nArt. 1º Aprova o plano.\n\n"
        "ANEXO I\nPlanilha orçamentária detalhada.\n"
    )
    doc = parse_document(plain=text, title="PORTARIA Nº 10/2026")
    assert "ANEXO I" in doc.plain_text()


def test_faz_saber_formula_is_command():
    text = "LEI Nº 9/2026\nFAZ SABER:\nArt. 1º Fica autorizado.\n"
    doc = parse_document(plain=text, title="LEI Nº 9/2026")
    assert "command" in _blocks(doc)
