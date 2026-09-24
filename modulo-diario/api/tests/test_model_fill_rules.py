"""Regras de preenchimento do modelo documental que o ato publicado depende.

Cobre três defeitos vistos em produção (Farol, set/2026): o texto do ato saía
no gênero do documento de referência, o valor repetia a unidade que já estava
no texto fixo ("quinze dias dias") e a data do próprio ato ficava pendente
mesmo sendo, por definição, a do dia da montagem.
"""

from __future__ import annotations

from app.document_model.fill import interpolate
from app.document_model.generation import build_system_message, field_context
from app.document_model.renderer import act_date_defaults, render
from app.document_model.schemas import (
    DocumentField,
    DocumentModelConfig,
    FieldType,
    SectionKind,
    SectionSpec,
)
from app.services.document_numbering import institutional_today
from app.services.pdf_utils import format_date

_TEXT = (
    "Conceder férias de {{dias_com_extenso}} dias {{genero:ao servidor|à servidora}} "
    "{{nome_servidor}}, em {{data_ato_extenso}}."
)


def _cfg() -> DocumentModelConfig:
    return DocumentModelConfig(
        purpose="Concessão de férias",
        scope_document_type="portaria",
        document_title="PORTARIA",
        fields=[
            DocumentField(key="nome_servidor", label="Servidor", type=FieldType.TEXT,
                          required=True),
            DocumentField(key="dias_com_extenso", label="Dias", type=FieldType.TEXT,
                          required=True),
            DocumentField(key="genero", label="Gênero", type=FieldType.SELECT,
                          required=True, options=["masculino", "feminino"]),
            DocumentField(key="data_ato_extenso", label="Data do ato",
                          type=FieldType.TEXT, required=True),
        ],
        sections=[SectionSpec(id="a1", kind=SectionKind.ARTICLE, text=_TEXT)],
    )


# ── Gênero ────────────────────────────────────────────────────────────────


def test_gender_marker_follows_the_declared_field():
    text = "{{genero:ao servidor|à servidora}} {{nome}}"
    assert interpolate(text, {"genero": "feminino", "nome": "ROSELI"}) == "à servidora ROSELI"
    assert interpolate(text, {"genero": "masculino", "nome": "ALISSON"}) == "ao servidor ALISSON"


def test_gender_marker_defaults_to_the_first_alternative():
    """Sem gênero informado o texto não pode ficar quebrado nem meio vazio."""
    text = "{{genero:nomeado|nomeada}}"
    assert interpolate(text, {}) == "nomeado"
    assert interpolate(text, {"genero": ""}) == "nomeado"


# ── Repetição da unidade ──────────────────────────────────────────────────


def test_value_does_not_repeat_the_word_that_follows_it():
    text = "férias de {{dias}} dias"
    assert interpolate(text, {"dias": "quinze dias"}) == "férias de quinze dias"
    assert interpolate(text, {"dias": "quinze"}) == "férias de quinze dias"


def test_repetition_is_detected_across_html_tags():
    """Modelos importados do Word guardam o parágrafo como HTML."""
    text = "de {{dias}}</span><span> dias"
    assert interpolate(text, {"dias": "30 (trinta) dias"}) == "de 30 (trinta)</span><span> dias"


def test_short_words_and_later_repetitions_are_left_alone():
    assert interpolate("em {{d}} de 2026", {"d": "15 de setembro"}) == "em 15 de setembro de 2026"
    assert interpolate("{{c}} de escolas", {"c": "ZELADORA"}) == "ZELADORA de escolas"


def test_prompt_shows_the_surrounding_text_of_each_field():
    cfg = _cfg()
    context = field_context(cfg, "dias_com_extenso")
    assert "[dias_com_extenso] dias" in context
    # marcadores vizinhos aparecem como texto legível, não como sintaxe
    assert "{{" not in context and "ao servidor" in context
    assert "no texto" in build_system_message(cfg)


# ── Data do ato ───────────────────────────────────────────────────────────


def test_act_date_defaults_to_today_in_the_expected_format():
    defaults = act_date_defaults(_cfg())
    assert defaults["data_ato_extenso"] == format_date(institutional_today())


def test_act_date_is_filled_without_leaving_a_pending_field():
    outcome = render(_cfg(), {"nome_servidor": "ROSELI APARECIDA MENDES",
                              "dias_com_extenso": "quinze", "genero": "feminino"})
    text = outcome.document.plain_text()
    assert format_date(institutional_today()) in text
    assert "à servidora ROSELI APARECIDA MENDES" in text
    assert "quinze dias" in text and "dias dias" not in text
    assert [p.as_dict()["key"] for p in outcome.fill.pending] == []


def test_act_date_informed_by_the_author_wins_over_the_default():
    outcome = render(_cfg(), {"nome_servidor": "X", "dias_com_extenso": "dez",
                              "genero": "masculino",
                              "data_ato_extenso": "1 de janeiro de 2026"})
    assert "1 de janeiro de 2026" in outcome.document.plain_text()
