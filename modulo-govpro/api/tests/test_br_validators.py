"""Testes de CPF/CNPJ (incl. CNPJ alfanumérico) e máscaras LGPD."""

from app.core.br_validators import (
    compute_cnpj_dv,
    format_cnpj,
    format_cpf,
    mask_cnpj,
    mask_cpf,
    mask_cpf_cnpj,
    validate_cnpj,
    validate_cpf,
)


def test_cpf_valido():
    assert validate_cpf("111.444.777-35") is True
    assert validate_cpf("11144477735") is True


def test_cpf_invalido():
    assert validate_cpf("111.444.777-36") is False
    assert validate_cpf("00000000000") is False
    assert validate_cpf("123") is False


def test_cnpj_numerico_valido():
    assert validate_cnpj("11.222.333/0001-81") is True
    assert validate_cnpj("11222333000181") is True


def test_cnpj_numerico_invalido():
    assert validate_cnpj("11.222.333/0001-82") is False


def test_cnpj_alfanumerico_round_trip():
    base = "12ABC34501DE"
    dv = compute_cnpj_dv(base)
    cnpj = f"{base}{dv}"
    assert validate_cnpj(cnpj) is True


def test_cnpj_alfanumerico_invalido():
    assert validate_cnpj("12ABC34501DE99") is False
    assert validate_cnpj("12ABC34501DE") is False  # tamanho errado


def test_cnpj_alfanumerico_com_formatacao():
    base = "12ABC34501DE"
    dv = compute_cnpj_dv(base)
    formatado = format_cnpj(f"{base}{dv}")
    assert validate_cnpj(formatado) is True


def test_mascaras():
    assert mask_cpf("11144477735") == "***.***.***-35"
    assert mask_cnpj("11222333000181") == "**.***.***/****-81"
    assert mask_cpf_cnpj("11144477735") == "***.***.***-35"
    assert mask_cpf_cnpj("11222333000181") == "**.***.***/****-81"
    assert mask_cpf_cnpj("123") is None


def test_formatadores():
    assert format_cpf("11144477735") == "111.444.777-35"
    assert format_cnpj("11222333000181") == "11.222.333/0001-81"
