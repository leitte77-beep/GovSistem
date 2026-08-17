"""Motor de contagem de prazos (Lei 9.784/1999 art. 66; CPC art. 224).

Regras:
- Exclui o dia do início, inclui o do vencimento.
- Prorroga para o próximo dia útil quando o vencimento cair em dia não útil.
- Dias corridos (padrão) ou úteis.
"""

from datetime import date, timedelta


def eh_dia_util(d: date, feriados: set[date]) -> bool:
    return d.weekday() < 5 and d not in feriados


def proximo_dia_util(d: date, feriados: set[date]) -> date:
    while not eh_dia_util(d, feriados):
        d += timedelta(days=1)
    return d


def adicionar_dias_corridos(data_inicio: date, dias: int) -> date:
    """Exclui o dia do início: vencimento = início + dias corridos."""
    if dias <= 0:
        return data_inicio
    return data_inicio + timedelta(days=dias)


def adicionar_dias_uteis(data_inicio: date, dias: int, feriados: set[date]) -> date:
    """Conta `dias` úteis a partir do dia seguinte ao início (exclui o início)."""
    atual = data_inicio + timedelta(days=1)
    contados = 0
    while contados < dias:
        if eh_dia_util(atual, feriados):
            contados += 1
        atual += timedelta(days=1)
    return atual - timedelta(days=1)


def calcular_vencimento(
    data_inicio: date,
    dias: int,
    modo: str = "CORRIDOS",
    feriados: set[date] | None = None,
) -> date:
    """Vencimento com a regra legal completa (exclui início, inclui fim, prorroga)."""
    feriados = feriados or set()
    if dias <= 0:
        return proximo_dia_util(data_inicio, feriados)

    if modo == "UTEIS":
        base = adicionar_dias_uteis(data_inicio, dias, feriados)
    else:
        base = adicionar_dias_corridos(data_inicio, dias)

    # Se o vencimento cair em dia não útil, prorroga para o próximo dia útil.
    return proximo_dia_util(base, feriados)
