"""Pure unit tests for the act-type configuration rules module.

No DB, no HTTP: these pin the allow-list behaviour that is the whole point of
"the admin never writes raw JSON" and "no arbitrary code in templates".
"""
import datetime

import pytest

from app.core.act_type_config import (
    ActTypeConfigError,
    config_dynamic_fields,
    format_act_title,
    normalize_config,
    validate_dynamic_values,
    validate_title_pattern,
)

# ── Config normalization / structural validation ─────────────────────────────


def test_default_config_is_permissive():
    cfg = normalize_config(None)
    assert cfg["number_required"] is False
    assert cfg["year_required"] is False
    assert cfg["allow_free_responsible"] is True
    assert cfg["dynamic_fields"] == []


def test_normalize_full_config():
    cfg = normalize_config({
        "number_required": True,
        "year_required": True,
        "title_pattern": "PORTARIA Nº {number}/{year}",
        "dynamic_fields": [
            {
                "key": "cnpj_contratado", "label": "CNPJ do contratado",
                "type": "cpf_cnpj", "required": True,
                "placeholder": "00.000.000/0000-00", "help": "help",
                "options": [],
            },
            {
                "key": "modalidade", "label": "Modalidade",
                "type": "select", "required": False, "options": ["Menor preço", "Técnica"],
            },
        ],
    })
    assert cfg["number_required"] is True
    assert cfg["title_pattern"] == "PORTARIA Nº {number}/{year}"
    fields = cfg["dynamic_fields"]
    assert [f["key"] for f in fields] == ["cnpj_contratado", "modalidade"]
    assert fields[0]["type"] == "cpf_cnpj"
    assert fields[0]["placeholder"] == "00.000.000/0000-00"
    assert fields[1]["options"] == ["Menor preço", "Técnica"]


def test_duplicate_field_key_rejected():
    with pytest.raises(ActTypeConfigError):
        normalize_config({
            "dynamic_fields": [
                {"key": "obj", "label": "Objeto", "type": "text", "options": []},
                {"key": "obj", "label": "Outro", "type": "text", "options": []},
            ]
        })


def test_select_requires_options():
    with pytest.raises(ActTypeConfigError):
        normalize_config({
            "dynamic_fields": [{"key": "m", "label": "Modalidade", "type": "select", "options": []}]
        })


def test_invalid_field_type_rejected():
    with pytest.raises(ActTypeConfigError):
        normalize_config({
            "dynamic_fields": [{"key": "x", "label": "X", "type": "javascript", "options": []}]
        })


def test_invalid_key_format_rejected():
    with pytest.raises(ActTypeConfigError):
        normalize_config({
            "dynamic_fields": [{"key": "9bad key!", "label": "X", "type": "text", "options": []}]
        })


def test_invalid_placeholder_rejected():
    with pytest.raises(ActTypeConfigError):
        normalize_config({"title_pattern": "PORTARIA {__import__('os')}"})


def test_only_allowed_placeholders_accepted():
    validate_title_pattern("LEI Nº {number}/{year}")
    with pytest.raises(ActTypeConfigError):
        validate_title_pattern("LEI Nº {evil}")


# ── Title rendering ──────────────────────────────────────────────────────────


def test_format_title_with_pattern():
    title = format_act_title(
        "PORTARIA Nº {number}/{year}", type_name="Portaria",
        number="25", year=2026, act_date=datetime.date(2026, 9, 1),
    )
    assert title == "PORTARIA Nº 25/2026"


def test_format_title_unknown_token_raises():
    with pytest.raises(ActTypeConfigError):
        format_act_title("{x}", type_name="P", number=None, year=None, act_date=None)


# ── Dynamic value validation (mirrors what the backend enforces) ─────────────


def _cfg(**overrides):
    base = {
        "dynamic_fields": [
            {"key": "cnpj_contratado", "label": "CNPJ", "type": "cpf_cnpj", "required": True, "options": []},
            {"key": "modalidade", "label": "Modalidade", "type": "select", "required": False, "options": ["Menor preço"]},
            {"key": "valor", "label": "Valor", "type": "currency", "required": False, "options": []},
        ]
    }
    base.update(overrides)
    return base


def test_missing_required_dynamic_field():
    errs = validate_dynamic_values(_cfg(), {"modalidade": "Menor preço"})
    assert any(e["field"] == "cnpj_contratado" for e in errs)


def test_valid_dynamic_values():
    errs = validate_dynamic_values(_cfg(), {
        "cnpj_contratado": "12.345.678/0001-90",
        "modalidade": "Menor preço",
    })
    assert errs == []


def test_invalid_cpf_cnpj():
    errs = validate_dynamic_values(_cfg(), {"cnpj_contratado": "123"})
    assert any(e["field"] == "cnpj_contratado" for e in errs)


def test_select_invalid_option():
    errs = validate_dynamic_values(_cfg(), {
        "cnpj_contratado": "12.345.678/0001-90", "modalidade": "Inexistente",
    })
    assert any(e["field"] == "modalidade" for e in errs)


def test_currency_must_be_numeric():
    errs = validate_dynamic_values(_cfg(), {
        "cnpj_contratado": "12.345.678/0001-90", "valor": "abc",
    })
    assert any(e["field"] == "valor" for e in errs)


def test_unknown_key_tolerated_not_flagged():
    errs = validate_dynamic_values(_cfg(), {
        "cnpj_contratado": "12.345.678/0001-90", "chave_legada": 1,
    })
    assert errs == []


def test_config_dynamic_fields_helper():
    assert config_dynamic_fields(_cfg()) == _cfg()["dynamic_fields"]
    assert config_dynamic_fields(None) == []
    assert config_dynamic_fields({"dynamic_fields": "oops"}) == []
