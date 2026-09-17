"""Contagem de prazos em dias úteis, com o calendário do município (§36).

Um prazo de "5 dias úteis" dado numa quinta-feira vence na quinta seguinte, e
não na terça — e se a quarta for feriado municipal, vence na sexta. Errar isso
em processo administrativo tem consequência real, então a contagem consulta o
calendário do tenant e não apenas o dia da semana.

Feriados nacionais valem para todos os municípios; estaduais e municipais são
cadastrados por cada organização.
"""

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calendario import Feriado
from app.models.enums import TipoFeriado

FIM_DE_SEMANA = {5, 6}  # sábado e domingo

# Feriados nacionais de data fixa. Os móveis (Carnaval, Páscoa, Corpus Christi)
# dependem do cálculo da Páscoa e entram por `feriados_moveis`.
NACIONAIS_FIXOS: list[tuple[int, int, str]] = [
    (1, 1, "Confraternização Universal"),
    (4, 21, "Tiradentes"),
    (5, 1, "Dia do Trabalho"),
    (9, 7, "Independência do Brasil"),
    (10, 12, "Nossa Senhora Aparecida"),
    (11, 2, "Finados"),
    (11, 15, "Proclamação da República"),
    (11, 20, "Consciência Negra"),
    (12, 25, "Natal"),
]


def domingo_de_pascoa(ano: int) -> date:
    """Algoritmo de Meeus/Jones/Butcher para a Páscoa gregoriana."""
    a = ano % 19
    b, c = divmod(ano, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    m = (32 + 2 * e + 2 * i - h - k) % 7
    n = (a + 11 * h + 22 * m) // 451
    mes, dia = divmod(h + m - 7 * n + 114, 31)
    return date(ano, mes, dia + 1)


def feriados_moveis(ano: int) -> list[tuple[date, str]]:
    """Feriados que se deslocam com a Páscoa."""
    pascoa = domingo_de_pascoa(ano)
    return [
        (pascoa - timedelta(days=48), "Carnaval"),
        (pascoa - timedelta(days=47), "Carnaval"),
        (pascoa - timedelta(days=2), "Sexta-feira Santa"),
        (pascoa + timedelta(days=60), "Corpus Christi"),
    ]


class Calendario:
    """Calendário resolvido de uma organização, pronto para contar prazos.

    Carrega os feriados uma vez e responde em memória: contar um prazo de 30
    dias úteis faria trinta consultas ao banco se cada dia fosse verificado
    separadamente.
    """

    def __init__(
        self,
        feriados: list[Feriado],
        *,
        ponto_facultativo_e_util: bool = False,
    ):
        self._feriados = feriados
        self._ponto_facultativo_e_util = ponto_facultativo_e_util
        self._cache_moveis: dict[int, set[date]] = {}

    def _moveis_do_ano(self, ano: int) -> set[date]:
        if ano not in self._cache_moveis:
            self._cache_moveis[ano] = {d for d, _ in feriados_moveis(ano)}
        return self._cache_moveis[ano]

    def eh_feriado(self, dia: date) -> bool:
        if dia in self._moveis_do_ano(dia.year):
            return True
        for feriado in self._feriados:
            if not feriado.ocorre_em(dia):
                continue
            if feriado.conta_como_util:
                continue
            if (
                feriado.tipo == TipoFeriado.PONTO_FACULTATIVO
                and self._ponto_facultativo_e_util
            ):
                continue
            return True
        return False

    def eh_dia_util(self, dia: date) -> bool:
        return dia.weekday() not in FIM_DE_SEMANA and not self.eh_feriado(dia)

    def proximo_dia_util(self, dia: date) -> date:
        while not self.eh_dia_util(dia):
            dia += timedelta(days=1)
        return dia

    def somar_dias_uteis(self, inicio: date, dias: int) -> date:
        """Soma dias úteis. Zero devolve o próximo dia útil a partir do início."""
        if dias <= 0:
            return self.proximo_dia_util(inicio)
        atual = inicio
        restantes = dias
        while restantes > 0:
            atual += timedelta(days=1)
            if self.eh_dia_util(atual):
                restantes -= 1
        return atual

    def dias_uteis_entre(self, inicio: date, fim: date) -> int:
        """Dias úteis de `inicio` (exclusivo) a `fim` (inclusive). Negativo se fim < início."""
        if fim == inicio:
            return 0
        sinal = 1 if fim > inicio else -1
        primeiro, ultimo = sorted((inicio, fim))
        total = 0
        atual = primeiro + timedelta(days=1)
        while atual <= ultimo:
            if self.eh_dia_util(atual):
                total += 1
            atual += timedelta(days=1)
        return total * sinal

    def prazo(
        self, inicio: datetime, dias: int | None, contagem: str
    ) -> datetime | None:
        """Aplica a contagem configurada na etapa/tarefa (§36)."""
        if not dias:
            return None
        if contagem == "HORAS":
            return inicio + timedelta(hours=dias)
        if contagem == "DIAS_CORRIDOS":
            return inicio + timedelta(days=dias)
        vencimento = self.somar_dias_uteis(inicio.date(), dias)
        # O prazo cai no fim do expediente do dia, não na hora em que foi criado.
        return datetime.combine(
            vencimento, datetime.min.time(), tzinfo=inicio.tzinfo or timezone.utc
        ) + timedelta(hours=23, minutes=59)


async def carregar_calendario(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    ponto_facultativo_e_util: bool = False,
) -> Calendario:
    feriados = (
        await db.execute(
            select(Feriado).where(
                Feriado.deleted_at.is_(None),
                Feriado.ativo.is_(True),
                or_(
                    Feriado.organization_id == organization_id,
                    Feriado.organization_id.is_(None),
                ),
            )
        )
    ).scalars().all()
    return Calendario(
        list(feriados), ponto_facultativo_e_util=ponto_facultativo_e_util
    )
