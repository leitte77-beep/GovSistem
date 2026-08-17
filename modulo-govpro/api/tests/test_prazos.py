"""Testes do motor de contagem de prazos (Lei 9.784/1999 art. 66)."""

from datetime import date

from app.core.feriados import data_pascoa, feriados_nacionais
from app.core.prazos import (
    adicionar_dias_corridos,
    adicionar_dias_uteis,
    calcular_vencimento,
    eh_dia_util,
    proximo_dia_util,
)


def test_eh_dia_util():
    assert eh_dia_util(date(2026, 8, 10), set()) is True  # segunda
    assert eh_dia_util(date(2026, 8, 15), set()) is False  # sábado
    assert eh_dia_util(date(2026, 8, 16), set()) is False  # domingo
    assert eh_dia_util(date(2026, 8, 14), {date(2026, 8, 14)}) is False  # feriado


def test_proximo_dia_util_pula_fim_de_semana():
    assert proximo_dia_util(date(2026, 8, 15), set()) == date(2026, 8, 17)  # sáb -> seg


def test_corridos_exclui_inicio_inclui_fim():
    # início segunda 10, 5 dias corridos -> base sábado 15 -> prorroga para seg 17
    assert adicionar_dias_corridos(date(2026, 8, 10), 5) == date(2026, 8, 15)


def test_uteis_contagem():
    # início segunda 10, 5 dias úteis -> 11,12,13,14,17
    assert adicionar_dias_uteis(date(2026, 8, 10), 5, set()) == date(2026, 8, 17)


def test_vencimento_corridos_prorroga_para_dia_util():
    assert calcular_vencimento(date(2026, 8, 10), 5, "CORRIDOS") == date(2026, 8, 17)


def test_vencimento_uteis():
    assert calcular_vencimento(date(2026, 8, 10), 5, "UTEIS") == date(2026, 8, 17)


def test_vencimento_uteis_com_feriado():
    # sexta 14 é feriado: 5 dias úteis a partir de 10 -> 11,12,13,17,18
    feriados = {date(2026, 8, 14)}
    assert calcular_vencimento(date(2026, 8, 10), 5, "UTEIS", feriados) == date(2026, 8, 18)


def test_vencimento_zero_dias():
    # sem prazo: retorna o próximo dia útil (início)
    assert calcular_vencimento(date(2026, 8, 15), 0, "CORRIDOS") == date(2026, 8, 17)


def test_data_pascoa():
    assert data_pascoa(2024) == date(2024, 3, 31)
    assert data_pascoa(2025) == date(2025, 4, 20)


def test_feriados_nacionais_fixos():
    fixos = feriados_nacionais(2026)
    assert date(2026, 9, 7) in fixos
    assert date(2026, 12, 25) in fixos
    assert "Carnaval" in feriados_nacionais(2026).values()
    assert "Corpus Christi" in feriados_nacionais(2026).values()
