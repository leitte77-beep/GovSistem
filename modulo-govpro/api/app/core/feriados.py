"""Feriados nacionais (fixos e móveis) para o calendário de prazos."""

from datetime import date


def data_pascoa(ano: int) -> date:
    """Domingo de Páscoa — algoritmo de Meeus/Jones/Butcher (gregoriano)."""
    a = ano % 19
    b = ano // 100
    c = ano % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    ll = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * ll) // 451
    mes = (h + ll - 7 * m + 114) // 31
    dia = ((h + ll - 7 * m + 114) % 31) + 1
    return date(ano, mes, dia)


def feriados_nacionais_fixos(ano: int) -> dict[date, str]:
    fixos = [
        (date(ano, 1, 1), "Confraternização Universal"),
        (date(ano, 4, 21), "Tiradentes"),
        (date(ano, 5, 1), "Dia do Trabalho"),
        (date(ano, 9, 7), "Independência do Brasil"),
        (date(ano, 10, 12), "Nossa Senhora Aparecida"),
        (date(ano, 11, 2), "Finados"),
        (date(ano, 11, 15), "Proclamação da República"),
        (date(ano, 11, 20), "Dia da Consciência Negra"),
        (date(ano, 12, 25), "Natal"),
    ]
    return dict(fixos)


def feriados_nacionais_moveis(ano: int) -> dict[date, str]:
    """Carnaval, Sexta-feira Santa e Corpus Christi (derivados da Páscoa)."""
    from datetime import timedelta

    pascoa = data_pascoa(ano)
    return {
        pascoa - timedelta(days=47): "Carnaval",
        pascoa - timedelta(days=2): "Sexta-feira Santa",
        pascoa + timedelta(days=60): "Corpus Christi",
    }


def feriados_nacionais(ano: int) -> dict[date, str]:
    return {**feriados_nacionais_fixos(ano), **feriados_nacionais_moveis(ano)}
