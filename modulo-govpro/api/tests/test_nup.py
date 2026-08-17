"""Testes do DV do NUP — vetores oficiais do Anexo da Portaria 11/2019."""

import pytest

from app.core.nup import calcular_dv, formatar_nup, parse_nup, validar_nup


@pytest.mark.parametrize(
    "base,dv",
    [
        ("350410003872000", "19"),
        ("040000014122000", "26"),
    ],
)
def test_calcular_dv_vetores_oficiais(base, dv):
    assert calcular_dv(base) == dv


def test_formatar_nup_vetor_oficial():
    assert formatar_nup(35041, 387, 2000, "19") == "35041.000387/2000-19"


def test_formatar_nup_calcula_dv_quando_omitido():
    nup = formatar_nup(35041, 387, 2000)
    assert nup == "35041.000387/2000-19"


def test_validar_nup_oficial():
    assert validar_nup("35041.000387/2000-19") is True
    assert validar_nup("04000.001412/2000-26") is True


def test_validar_nup_dv_incorreto():
    assert validar_nup("35041.000387/2000-20") is False


def test_validar_nup_formato_invalido():
    assert validar_nup("123") is False
    assert validar_nup("") is False


def test_parse_nup():
    parsed = parse_nup("35041.000387/2000-19")
    assert parsed["codigo_unidade"] == "35041"
    assert parsed["sequencial"] == 387
    assert parsed["ano"] == 2000
    assert parsed["dv"] == "19"


def test_base_nao_numerica_levanta_erro():
    with pytest.raises(ValueError):
        calcular_dv("123")
