"""Validadores BR: casos válidos, inválidos e sequências repetidas (Fase 0)."""

import pytest

from app.core.br_validators import (
    competencia_atual,
    gerar_cnpj_alfanumerico,
    mascarar_cnpj,
    mascarar_cns,
    mascarar_cpf,
    validar_cbo,
    validar_cep,
    validar_ciap2,
    validar_cid10,
    validar_cnes,
    validar_cnpj,
    validar_cns,
    validar_codigo_ibge,
    validar_competencia,
    validar_cpf,
    validar_pis,
    validar_sigtap,
)


@pytest.mark.parametrize(
    "cpf",
    ["52998224725", "11144477735", "12345678909", "529.982.247-25"],
)
def test_cpf_valido(cpf):
    assert validar_cpf(cpf)


@pytest.mark.parametrize(
    "cpf",
    [
        "11111111111",
        "00000000000",
        "12345678900",
        "52998224724",
        "5299822472",
        "529982247250",
        "",
        "abc",
    ],
)
def test_cpf_invalido(cpf):
    assert not validar_cpf(cpf)


@pytest.mark.parametrize(
    "cns",
    ["799639810752073", "129542537630793", "847902219572128", "727754933321558"],
)
def test_cns_valido(cns):
    assert validar_cns(cns)


@pytest.mark.parametrize(
    "cns",
    ["799639810752074", "099639810752073", "311111111111111", "123", ""],
)
def test_cns_invalido(cns):
    assert not validar_cns(cns)


@pytest.mark.parametrize("cnpj", ["11222333000181", "34028316000103", "12ABC34501DE35"])
def test_cnpj_valido(cnpj):
    assert validar_cnpj(cnpj)


def test_cnpj_alfanumerico_gerado():
    assert validar_cnpj(gerar_cnpj_alfanumerico("12ABC34501DE"))
    assert validar_cnpj("12abc34501de35")


@pytest.mark.parametrize(
    "cnpj",
    ["11222333000180", "00000000000000", "12ABC34501DE34", "1122233300018", "", "!!!"],
)
def test_cnpj_invalido(cnpj):
    assert not validar_cnpj(cnpj)


@pytest.mark.parametrize("pis", ["12033236694", "12345678900", "17012345673"])
def test_pis_valido(pis):
    assert validar_pis(pis)


@pytest.mark.parametrize("pis", ["12033236695", "11111111111", "123", ""])
def test_pis_invalido(pis):
    assert not validar_pis(pis)


@pytest.mark.parametrize("cep", ["80000000", "80000-000", "01001000"])
def test_cep_valido(cep):
    assert validar_cep(cep)


@pytest.mark.parametrize("cep", ["8000000", "800000000", "", "abcdefgh"])
def test_cep_invalido(cep):
    assert not validar_cep(cep)


@pytest.mark.parametrize("cnes", ["1234567", "9999999"])
def test_cnes_estrutural(cnes):
    assert validar_cnes(cnes)


@pytest.mark.parametrize("cnes", ["123456", "12345678", ""])
def test_cnes_invalido(cnes):
    assert not validar_cnes(cnes)


def test_cnes_universo():
    assert validar_cnes("1234567", {"1234567"})
    assert not validar_cnes("1234567", {"7654321"})


@pytest.mark.parametrize("cbo", ["225125", "322205"])
def test_cbo_estrutural(cbo):
    assert validar_cbo(cbo)


@pytest.mark.parametrize("cbo", ["22512", "2251250", ""])
def test_cbo_invalido(cbo):
    assert not validar_cbo(cbo)


@pytest.mark.parametrize("codigo", ["0101010020", "0301010030"])
def test_sigtap_estrutural(codigo):
    assert validar_sigtap(codigo)


@pytest.mark.parametrize("codigo", ["010101002", "01010100200", ""])
def test_sigtap_invalido(codigo):
    assert not validar_sigtap(codigo)


@pytest.mark.parametrize("codigo", ["3550308", "3304557", "4106902", "4205407"])
def test_ibge_estrutural(codigo):
    assert validar_codigo_ibge(codigo)


@pytest.mark.parametrize("codigo", ["0550308", "5450308", "355030", "35503088", ""])
def test_ibge_invalido(codigo):
    assert not validar_codigo_ibge(codigo)


def test_ibge_universo_oficial():
    assert validar_codigo_ibge("3550308", {"3550308"})
    assert not validar_codigo_ibge("3550308", {"3304557"})


@pytest.mark.parametrize("cid", ["A00", "A00.0", "I10", "Z00.1", "c50"])
def test_cid10_valido(cid):
    assert validar_cid10(cid)


@pytest.mark.parametrize("cid", ["AA0", "A0", "100", "", "A0000"])
def test_cid10_invalido(cid):
    assert not validar_cid10(cid)


@pytest.mark.parametrize("ciap", ["A01", "K86", "P02.1"])
def test_ciap2_valido(ciap):
    assert validar_ciap2(ciap)


@pytest.mark.parametrize("ciap", ["01", "A1", "AA1", ""])
def test_ciap2_invalido(ciap):
    assert not validar_ciap2(ciap)


@pytest.mark.parametrize("competencia", ["202601", "202612", "199912"])
def test_competencia_valida(competencia):
    assert validar_competencia(competencia)


@pytest.mark.parametrize("competencia", ["202600", "202613", "20261", "", "2026-01"])
def test_competencia_invalida(competencia):
    assert not validar_competencia(competencia)


def test_mascaras_nao_expoem_documento():
    assert mascarar_cpf("52998224725") == "***.***.***-25"
    assert mascarar_cns("799639810752073") == "*** *** *** 2073"
    assert mascarar_cnpj("11222333000181") == "**.***.***/****-81"


def test_competencia_atual_formato():
    assert len(competencia_atual("America/Sao_Paulo")) == 6
    assert validar_competencia(competencia_atual("America/Cuiaba"))
