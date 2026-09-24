"""Dados do documento-exemplo não podem sobreviver no modelo aprendido.

Um modelo aprendido de um PDF do Diário trouxe 16 linhas com itens, marcas,
valores e fornecedores de OUTRO processo. Como o modelo insere seus textos
fixos em toda minuta, essas linhas foram publicadas e assinadas como se
fossem do novo ato (Farol, edição 52 de 2026).
"""

from __future__ import annotations

from app.document_model.generation import _fold_text, _word_model_for_prompt
from app.document_model.learning import _repair_config, _rows_without_sample_data


def test_literal_rows_are_dropped_and_template_rows_kept():
    rows = [
        ["1", "1", "Suplemento nutricional", "NUTRILLAR", "100.0000", "7.345,0000"],
        ["{{lote}}", "{{ordem}}", "{{descricao}}", "{{marca}}", "{{qtd}}", "{{total}}"],
    ]
    kept = _rows_without_sample_data(rows)
    assert kept == [rows[1]]


def test_learned_table_keeps_the_shape_without_the_data():
    data = {
        "purpose": "Homologação",
        "scope_document_type": "licitacao",
        "document_title": "TERMO",
        "summary": "{{objeto}}",
        "fields": [],
        "sections": [{
            "id": "itens", "kind": "table",
            "table_headers": ["Item", "Descrição", "Valor"],
            "table_rows": [
                ["1", "Fórmula infantil DANONE", "14.750,0000"],
                ["2", "Suplemento NUTRILLAR", "7.345,0000"],
            ],
        }],
    }
    config = _repair_config(data, "licitacao")
    table = next(s for s in config["sections"] if s["kind"] == "table")
    assert table["table_headers"] == ["Item", "Descrição", "Valor"]
    assert table["table_rows"] == []
    flat = str(config)
    for leaked in ("DANONE", "NUTRILLAR", "14.750,0000"):
        assert leaked not in flat, leaked


class _Model:
    def __init__(self, slug: str) -> None:
        self.slug = slug
        self.id = slug


def test_word_model_wins_when_the_request_names_its_subject():
    models = [_Model("word-homologacao-dispensa"), _Model("word-aviso-dispensa"),
              _Model("ia-termo-adjudicacao")]
    chosen = _word_model_for_prompt(models, _fold_text("homologação da dispensa 46/2026"))
    assert chosen is not None and chosen.slug == "word-homologacao-dispensa"


def test_ambiguous_request_goes_to_the_classifier():
    """"dispensa" serve a dois modelos Word: quem decide é o classificador."""
    models = [_Model("word-homologacao-dispensa"), _Model("word-aviso-dispensa")]
    assert _word_model_for_prompt(models, _fold_text("dispensa")) is None
