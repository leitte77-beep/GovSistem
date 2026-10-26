"""Relatórios gerenciais e comparativos temporais (B.6-047/048/049, B.3-019/021,
B.4-026/028, B.12-055).

Só agregados: nenhuma linha traz dado pessoal. O universo respeita o escopo de
estabelecimento do usuário. ``comparar=True`` acrescenta o período anterior de
mesmo tamanho e a variação percentual de cada métrica.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.core.autorizacao import escopo_permite
from app.core.errors import Unprocessable
from app.core.permissoes import Permissao
from app.models.agenda import FilaAtendimento
from app.models.cidadao import Cidadao, CidadaoCondicao
from app.models.estoque import Movimentacao
from app.models.nucleo import Usuario
from app.models.odontologia import OdontoAtendimento, OdontoProcedimento
from app.models.prontuario import Atendimento, Prescricao, RegistroAssistencial
from app.services import configuracoes
from app.services.estoque import local as local_estoque

FAIXAS = [(0, 1), (1, 4), (5, 9), (10, 14), (15, 19), (20, 39), (40, 59), (60, 200)]


async def _fuso(db, tenant_id) -> ZoneInfo:
    return ZoneInfo(
        await configuracoes.valor(db, tenant_id, "geral.fuso_horario", "America/Sao_Paulo")
    )


async def _intervalo(db, tenant_id, inicio: date, fim: date) -> tuple[datetime, datetime]:
    if fim < inicio:
        raise Unprocessable("A data final antecede a inicial.", code="periodo_invalido")
    if (fim - inicio).days > 731:
        raise Unprocessable("Período máximo de 2 anos.", code="periodo_longo")
    fuso = await _fuso(db, tenant_id)
    return (
        datetime.combine(inicio, time.min, tzinfo=fuso).astimezone(timezone.utc),
        datetime.combine(fim + timedelta(days=1), time.min, tzinfo=fuso).astimezone(timezone.utc),
    )


def _utc(v: datetime) -> datetime:
    return v if v.tzinfo else v.replace(tzinfo=timezone.utc)


def _faixa(nascimento: date | None, em: date) -> str:
    if nascimento is None:
        return "SEM_DATA"
    idade = em.year - nascimento.year - ((em.month, em.day) < (nascimento.month, nascimento.day))
    for a, b in FAIXAS:
        if a <= idade <= b:
            return f"{a}-{b}" if b < 200 else f"{a}+"
    return "SEM_DATA"


def _linhas(acumulado: dict[str, dict[str, float]], metricas: list[str]) -> list[dict]:
    return [
        {"chave": chave, **{m: round(valores.get(m, 0), 2) for m in metricas}}
        for chave, valores in sorted(acumulado.items())
    ]


async def com_comparativo(gerar, db, tenant_id, inicio: date, fim: date, comparar: bool, **kw):
    """B.6-049/B.3-021 — mesmo relatório no período anterior e variação."""
    atual = await gerar(db, tenant_id, inicio, fim, **kw)
    if not comparar:
        return atual
    dias = (fim - inicio).days + 1
    anterior = await gerar(
        db, tenant_id, inicio - timedelta(days=dias), inicio - timedelta(days=1), **kw
    )
    previas = {x["chave"]: x for x in anterior["linhas"]}
    for linha in atual["linhas"]:
        base = previas.get(linha["chave"], {})
        for m in atual["metricas"]:
            antes = base.get(m) or 0
            linha[f"{m}_anterior"] = antes
            linha[f"{m}_variacao_pct"] = (
                round(100 * (linha[m] - antes) / antes, 1)
                if antes and linha[m] is not None
                else None
            )
    atual["periodo_anterior"] = {
        "inicio": inicio - timedelta(days=dias),
        "fim": inicio - timedelta(days=1),
    }
    return atual


async def _chave_tempo(db, tenant_id, quando: datetime) -> str:
    return _utc(quando).astimezone(await _fuso(db, tenant_id)).strftime("%Y-%m")


# ── PEC (B.6-048/049) ───────────────────────────────────────────────────────
async def atendimentos_pec(db, tenant_id, inicio, fim, *, ator: Usuario, agrupar_por: str) -> dict:
    ini, fim_ = await _intervalo(db, tenant_id, inicio, fim)
    metricas = ["atendimentos", "encerrados", "retroativos", "prescricoes", "registros"]
    acumulado: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    if agrupar_por == "diagnostico":
        condicoes = (
            await db.scalars(
                select(CidadaoCondicao).where(
                    CidadaoCondicao.tenant_id == tenant_id,
                    CidadaoCondicao.created_at >= ini,
                    CidadaoCondicao.created_at < fim_,
                    CidadaoCondicao.baixa_em.is_(None),
                )
            )
        ).all()
        for c in condicoes:
            acumulado[f"{c.tipo_codigo}:{c.codigo}"]["diagnosticos"] += 1
        return {
            "inicio": inicio,
            "fim": fim,
            "agrupar_por": agrupar_por,
            "metricas": ["diagnosticos"],
            "linhas": _linhas(acumulado, ["diagnosticos"]),
        }
    atendimentos = (
        await db.scalars(
            select(Atendimento).where(
                Atendimento.tenant_id == tenant_id,
                Atendimento.iniciado_em >= ini,
                Atendimento.iniciado_em < fim_,
            )
        )
    ).all()
    visiveis = {
        a.id: a
        for a in atendimentos
        if escopo_permite(ator, Permissao.PRONTUARIO_LER, estabelecimento_id=a.estabelecimento_id)
    }
    chaves: dict[uuid.UUID, str] = {}
    for a in visiveis.values():
        if agrupar_por == "estabelecimento":
            chave = str(a.estabelecimento_id or "SEM_UNIDADE")
        elif agrupar_por == "tipo":
            chave = a.tipo
        else:
            chave = await _chave_tempo(db, tenant_id, a.iniciado_em)
        chaves[a.id] = chave
        acumulado[chave]["atendimentos"] += 1
        acumulado[chave]["encerrados"] += a.status == "ENCERRADO"
        acumulado[chave]["retroativos"] += a.retroativo
    if visiveis:
        for p in (
            await db.scalars(select(Prescricao).where(Prescricao.atendimento_id.in_(visiveis)))
        ).all():
            acumulado[chaves[p.atendimento_id]]["prescricoes"] += 1
        tipos: set[str] = set()
        for r in (
            await db.scalars(
                select(RegistroAssistencial).where(
                    RegistroAssistencial.atendimento_id.in_(visiveis)
                )
            )
        ).all():
            acumulado[chaves[r.atendimento_id]]["registros"] += 1
            acumulado[chaves[r.atendimento_id]][f"registros_{r.tipo.lower()}"] += 1
            tipos.add(f"registros_{r.tipo.lower()}")
        metricas += sorted(tipos)
    return {
        "inicio": inicio,
        "fim": fim,
        "agrupar_por": agrupar_por,
        "metricas": metricas,
        "linhas": _linhas(acumulado, metricas),
    }


# ── Odontologia (B.3-019/021) ───────────────────────────────────────────────
async def atendimentos_odonto(
    db, tenant_id, inicio, fim, *, ator: Usuario, agrupar_por: str
) -> dict:
    ini, fim_ = await _intervalo(db, tenant_id, inicio, fim)
    metricas = ["atendimentos", "finalizados", "procedimentos"]
    acumulado: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    atendimentos = (
        await db.scalars(
            select(OdontoAtendimento).where(
                OdontoAtendimento.tenant_id == tenant_id,
                OdontoAtendimento.iniciado_em >= ini,
                OdontoAtendimento.iniciado_em < fim_,
                OdontoAtendimento.situacao != "CANCELADO",
            )
        )
    ).all()
    chaves: dict[uuid.UUID, str] = {}
    for a in atendimentos:
        if not escopo_permite(
            ator, Permissao.ODONTOLOGIA_LER, estabelecimento_id=a.estabelecimento_id
        ):
            continue
        if agrupar_por == "estabelecimento":
            chave = str(a.estabelecimento_id)
        elif agrupar_por == "profissional":
            chave = str(a.profissional_id or "SEM_PROFISSIONAL")
        elif agrupar_por == "tipo":
            chave = a.tipo
        elif agrupar_por == "faixa_etaria":
            cidadao = await db.get(Cidadao, a.cidadao_id)
            chave = _faixa(cidadao.data_nascimento if cidadao else None, _utc(a.iniciado_em).date())
        else:
            chave = await _chave_tempo(db, tenant_id, a.iniciado_em)
        chaves[a.id] = chave
        acumulado[chave]["atendimentos"] += 1
        acumulado[chave]["finalizados"] += a.situacao == "FINALIZADO"
    if chaves:
        for p in (
            await db.scalars(
                select(OdontoProcedimento).where(
                    OdontoProcedimento.atendimento_id.in_(chaves),
                    OdontoProcedimento.situacao == "REALIZADO",
                )
            )
        ).all():
            acumulado[chaves[p.atendimento_id]]["procedimentos"] += p.quantidade
    return {
        "inicio": inicio,
        "fim": fim,
        "agrupar_por": agrupar_por,
        "metricas": metricas,
        "linhas": _linhas(acumulado, metricas),
    }


# ── Estoque (B.4-026/028) ───────────────────────────────────────────────────
GRUPOS_MOV = {
    "ENTRADA": "entradas",
    "DEVOLUCAO": "entradas",
    "SAIDA": "saidas",
    "CONSUMO_INTERNO": "saidas",
    "DOACAO": "saidas",
    "DISPENSACAO": "dispensacoes",
    "ESTORNO_DISPENSACAO": "dispensacoes",
    "TRANSFERENCIA_SAIDA": "transferencias_saida",
    "TRANSFERENCIA_ENTRADA": "transferencias_entrada",
    "PERDA": "perdas",
    "QUEBRA": "perdas",
    "VENCIMENTO": "perdas",
    "AJUSTE_POSITIVO": "ajustes",
    "AJUSTE_NEGATIVO": "ajustes",
}


async def movimentacoes_estoque(
    db, tenant_id, inicio, fim, *, ator: Usuario, local_id, agrupar_por: str
) -> dict:
    loc = await local_estoque(db, tenant_id, local_id, ator, Permissao.ESTOQUE_LER)
    ini, fim_ = await _intervalo(db, tenant_id, inicio, fim)
    grupos = sorted(set(GRUPOS_MOV.values()))
    metricas = grupos + [f"valor_{g}" for g in grupos]
    acumulado: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for m in (
        await db.scalars(
            select(Movimentacao).where(
                Movimentacao.tenant_id == tenant_id,
                Movimentacao.local_id == loc.id,
                Movimentacao.ocorrido_em >= ini,
                Movimentacao.ocorrido_em < fim_,
            )
        )
    ).all():
        if agrupar_por == "produto":
            chave = str(m.produto_id)
        elif agrupar_por == "tipo":
            chave = m.tipo
        else:
            chave = await _chave_tempo(db, tenant_id, m.ocorrido_em)
        grupo = GRUPOS_MOV.get(m.tipo, "ajustes")
        acumulado[chave][grupo] += abs(m.quantidade)
        acumulado[chave][f"valor_{grupo}"] += abs(m.quantidade) * (m.custo_unitario or 0)
    return {
        "inicio": inicio,
        "fim": fim,
        "agrupar_por": agrupar_por,
        "local_id": loc.id,
        "metricas": metricas,
        "linhas": _linhas(acumulado, metricas),
    }


# ── Tempos da fila (B.6-047) ────────────────────────────────────────────────
def _minutos(a: datetime | None, b: datetime | None) -> float | None:
    if a is None or b is None:
        return None
    return max(0.0, (_utc(b) - _utc(a)).total_seconds() / 60)


async def tempos_fila(db, tenant_id, inicio, fim, *, ator: Usuario, agrupar_por: str) -> dict:
    ini, fim_ = await _intervalo(db, tenant_id, inicio, fim)
    medidas = ["espera_chamada", "triagem", "espera_consulta", "consulta", "permanencia"]
    soma: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    qtd: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    total: dict[str, int] = defaultdict(int)
    for f in (
        await db.scalars(
            select(FilaAtendimento).where(
                FilaAtendimento.tenant_id == tenant_id,
                FilaAtendimento.entrada_em >= ini,
                FilaAtendimento.entrada_em < fim_,
            )
        )
    ).all():
        if not escopo_permite(ator, Permissao.FILA_LER, estabelecimento_id=f.estabelecimento_id):
            continue
        if agrupar_por == "setor":
            chave = str(f.setor_id)
        elif agrupar_por == "estabelecimento":
            chave = str(f.estabelecimento_id)
        else:
            chave = await _chave_tempo(db, tenant_id, f.entrada_em)
        total[chave] += 1
        valores = {
            "espera_chamada": _minutos(f.entrada_em, f.chamado_em),
            "triagem": _minutos(f.triagem_inicio_em, f.triagem_fim_em),
            "espera_consulta": _minutos(f.triagem_fim_em or f.entrada_em, f.atendimento_inicio_em),
            "consulta": _minutos(f.atendimento_inicio_em, f.atendimento_fim_em),
            "permanencia": _minutos(f.entrada_em, f.atendimento_fim_em),
        }
        for k, v in valores.items():
            if v is not None:
                soma[chave][k] += v
                qtd[chave][k] += 1
    metricas = ["registros"] + [f"media_{m}_min" for m in medidas]
    linhas = []
    for chave in sorted(total):
        linha = {"chave": chave, "registros": total[chave]}
        for m in medidas:
            n = qtd[chave][m]
            linha[f"media_{m}_min"] = round(soma[chave][m] / n, 1) if n else None
        linhas.append(linha)
    return {
        "inicio": inicio,
        "fim": fim,
        "agrupar_por": agrupar_por,
        "metricas": metricas,
        "linhas": linhas,
    }
