"""Catálogo de relatórios: formato único (colunas + linhas + resumo).

Cada relatório é uma função que devolve `Relatorio`; o endpoint cuida do
resto — JSON para a tela, CSV, Excel e PDF oficial. A tela é genérica e
monta filtros e tabela a partir de `GET /relatorios/catalogo`.

Escopo: relatórios da organização toda (`org=True`: contratos, estoque,
auditoria) não abrem para usuário restrito a secretarias; os demais filtram
pelas secretarias do usuário.
"""

import csv
import io
import json
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Awaitable, Callable

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import escopo_unidades, filtro_escopo, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.core.timezone import get_tz, now_local, to_display
from app.models.abastecimento import Abastecimento, CorrecaoAbastecimento
from app.models.auditoria import Auditoria
from app.models.auth_models import User
from app.models.combustivel import Combustivel, ContratoPosto, Fornecedor, Tanque
from app.models.estoque import EntradaCombustivel, MovimentacaoEstoque
from app.models.manutencao import Manutencao, PlanoPreventivo
from app.models.motorista import Motorista
from app.models.nota_abastecimento import NotaAbastecimento
from app.models.ocorrencia import Ocorrencia
from app.models.unidade import Unidade
from app.models.veiculo import AlteracaoQuilometragem, Veiculo, VeiculoDocumento
from app.services.exporters import (
    RelatorioMeta,
    build_pdf,
    build_xlsx,
    formatar_celula,
    get_organizacao_meta,
)
from app.services.notas_abastecimento import MOTIVOS_SUBSTITUICAO

router = APIRouter(prefix="/relatorios/catalogo", tags=["relatórios"])

ALERTAS = {
    "DUPLICIDADE": "Possível duplicidade",
    "CONSUMO_FORA_PADRAO": "Consumo fora do padrão",
    "FORA_DO_HORARIO": "Fora do horário",
    "SEM_DESLOCAMENTO": "Sem deslocamento",
    "LITROS_ACIMA_MEDIA": "Litros acima da média",
    "INTERVALO_CURTO": "Intervalo curto entre abastecimentos",
    "SALDO_EXCEDIDO": "Saldo do contrato excedido",
    "SEM_CONTRATO": "Sem contrato vigente",
}


# ───────────────────────────── estrutura comum ─────────────────────────────


@dataclass
class Col:
    chave: str
    rotulo: str
    # texto | moeda | numero | inteiro | data | datahora | pct | situacao
    tipo: str = "texto"
    peso: int = 10
    total: bool = False


@dataclass
class Relatorio:
    colunas: list[Col]
    linhas: list[dict]
    resumo: list[tuple[str, str]] = field(default_factory=list)
    aviso: str | None = None
    # Coluna "id" de abastecimento/veículo vira link na tela.
    link: str | None = None


@dataclass
class Filtros:
    inicio: date
    fim: date
    unidade_id: uuid.UUID | None
    veiculo_id: uuid.UUID | None
    motorista_id: uuid.UUID | None
    fornecedor_id: uuid.UUID | None
    ini_dt: datetime
    fim_dt: datetime


@dataclass
class Definicao:
    titulo: str
    categoria: str
    descricao: str
    fn: Callable[[AsyncSession, User, Filtros], Awaitable[Relatorio]]
    filtros: tuple[str, ...] = ("periodo", "unidade")
    org: bool = False
    exige: tuple[str, ...] = ()
    paisagem: bool = True


CATALOGO: dict[str, Definicao] = {}


def relatorio(chave: str, **kw):
    def reg(fn):
        CATALOGO[chave] = Definicao(fn=fn, **kw)
        return fn

    return reg


def _br(v: float, casas: int = 2) -> str:
    return formatar_celula(round(v, casas)) if casas else formatar_celula(int(round(v)))


def _reais(v: float | None) -> str:
    return formatar_celula(v or 0, True)


def _f(v) -> float:
    return float(v) if v is not None else 0.0


def _dias(d: date | None) -> int | None:
    return (d - now_local().date()).days if d else None


def _situacao_prazo(dias: int | None, alerta: int = 30) -> str:
    if dias is None:
        return "Sem data"
    if dias < 0:
        return "Vencido"
    if dias <= alerta:
        return "A vencer"
    return "Em dia"


def _veic_nome(v: Veiculo) -> str:
    return " ".join(x for x in (v.marca, v.modelo) if x) or "-"


async def _nomes_usuarios(db: AsyncSession, ids) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return dict((await db.execute(select(User.id, User.name).where(User.id.in_(ids)))).all())


async def _nomes_unidades(db: AsyncSession, org_id) -> dict:
    return dict((await db.execute(select(Unidade.id, Unidade.nome).where(Unidade.organization_id == org_id))).all())


def _cond_abast(user: User, f: Filtros, *, confirmados: bool = True) -> list:
    cond = [
        Abastecimento.organization_id == user.organization_id,
        Abastecimento.deleted_at.is_(None),
        Abastecimento.data_abastecimento >= f.ini_dt,
        Abastecimento.data_abastecimento <= f.fim_dt,
        filtro_escopo(user, Abastecimento.unidade_id),
    ]
    if confirmados:
        cond.append(Abastecimento.status == "CONFIRMADO")
    if f.unidade_id:
        cond.append(Abastecimento.unidade_id == f.unidade_id)
    if f.veiculo_id:
        cond.append(Abastecimento.veiculo_id == f.veiculo_id)
    if f.motorista_id:
        cond.append(Abastecimento.motorista_id == f.motorista_id)
    if f.fornecedor_id:
        cond.append(Abastecimento.fornecedor_id == f.fornecedor_id)
    return cond


def _cond_veiculo(user: User, f: Filtros) -> list:
    cond = [
        Veiculo.organization_id == user.organization_id,
        Veiculo.deleted_at.is_(None),
        filtro_escopo(user, Veiculo.unidade_id),
    ]
    if f.unidade_id:
        cond.append(Veiculo.unidade_id == f.unidade_id)
    if f.veiculo_id:
        cond.append(Veiculo.id == f.veiculo_id)
    return cond


# ───────────────────────────── Controle ─────────────────────────────


@relatorio(
    "conferencia", titulo="Conferência de abastecimentos", categoria="Controle",
    descricao="Abastecimentos com alerta, corrigidos, cancelados ou com nota substituída — o que o fiscal precisa olhar.",
    filtros=("periodo", "unidade", "veiculo", "motorista", "posto"),
)
async def conferencia(db: AsyncSession, user: User, f: Filtros) -> Relatorio:
    subst = select(NotaAbastecimento.abastecimento_id).where(NotaAbastecimento.ativo.is_(True), NotaAbastecimento.versao > 1)
    corr = select(CorrecaoAbastecimento.abastecimento_id)
    linhas_db = (
        await db.execute(
            select(Abastecimento, Veiculo.placa, Motorista.nome)
            .join(Veiculo, Veiculo.id == Abastecimento.veiculo_id)
            .outerjoin(Motorista, Motorista.id == Abastecimento.motorista_id)
            .where(
                *_cond_abast(user, f, confirmados=False),
                or_(
                    and_(Abastecimento.alertas.isnot(None), Abastecimento.alertas != "[]", Abastecimento.alertas != ""),
                    Abastecimento.status != "CONFIRMADO",
                    Abastecimento.id.in_(corr),
                    Abastecimento.id.in_(subst),
                ),
            )
            .order_by(Abastecimento.data_abastecimento.desc())
        )
    ).all()
    ids = [a.id for a, *_ in linhas_db]
    correcoes: dict = defaultdict(list)
    if ids:
        for c in (await db.execute(
            select(CorrecaoAbastecimento).where(CorrecaoAbastecimento.abastecimento_id.in_(ids)).order_by(CorrecaoAbastecimento.created_at)
        )).scalars():
            correcoes[c.abastecimento_id].append(c)
    trocas: dict = {}
    if ids:
        for n in (await db.execute(
            select(NotaAbastecimento).where(NotaAbastecimento.abastecimento_id.in_(ids), NotaAbastecimento.ativo.is_(True), NotaAbastecimento.versao > 1)
        )).scalars():
            trocas[n.abastecimento_id] = MOTIVOS_SUBSTITUICAO.get(n.motivo_substituicao or "", "motivo não informado")
    usuarios = await _nomes_usuarios(db, [c.usuario_id for cs in correcoes.values() for c in cs])
    unidades = await _nomes_unidades(db, user.organization_id)

    linhas, cont = [], defaultdict(int)
    for a, placa, motorista in linhas_db:
        pontos = []
        try:
            codigos = json.loads(a.alertas) if a.alertas else []
        except ValueError:
            codigos = []
        for cod in codigos:
            pontos.append(ALERTAS.get(cod, cod.replace("_", " ").capitalize()))
            cont["alerta"] += 1
        for c in correcoes.get(a.id, []):
            quem = usuarios.get(c.usuario_id, "usuário")
            rot = "Cancelado" if c.tipo_correcao == "CANCELAMENTO" else "Corrigido"
            pontos.append(f"{rot} por {quem}: {c.justificativa}")
            cont["cancel" if c.tipo_correcao == "CANCELAMENTO" else "corr"] += 1
        if a.id in trocas:
            pontos.append(f"Nota substituída ({trocas[a.id]})")
            cont["troca"] += 1
        linhas.append({
            "id": str(a.id), "numero": a.numero, "data": to_display(a.data_abastecimento), "placa": placa,
            "secretaria": unidades.get(a.unidade_id, "-"), "motorista": motorista or "-",
            "litros": _f(a.quantidade_litros), "valor": _f(a.custo_total) if a.custo_total is not None else None,
            "situacao": "Cancelado" if a.status != "CONFIRMADO" else "Confirmado",
            "pontos": " · ".join(pontos) or "-",
        })
    return Relatorio(
        colunas=[
            Col("numero", "Número", peso=11), Col("data", "Data", "datahora", 10), Col("placa", "Placa", peso=7),
            Col("secretaria", "Secretaria", peso=11), Col("motorista", "Motorista", peso=12),
            Col("litros", "Litros", "numero", 6, True), Col("valor", "Valor", "moeda", 8, True),
            Col("situacao", "Situação", "situacao", 8), Col("pontos", "Pontos de atenção", peso=30),
        ],
        linhas=linhas,
        resumo=[
            ("Registros a conferir", _br(len(linhas), 0)), ("Alertas", _br(cont["alerta"], 0)),
            ("Correções", _br(cont["corr"], 0)), ("Cancelamentos", _br(cont["cancel"], 0)),
            ("Notas substituídas", _br(cont["troca"], 0)),
        ],
        link="abastecimento",
    )


@relatorio(
    "notas_posto", titulo="Notas fiscais por posto", categoria="Controle",
    descricao="Por posto: abastecimentos com e sem nota, substituídas e divergências entre a nota e o abastecimento (valor/CNPJ).",
    filtros=("periodo", "unidade", "posto"),
)
async def notas_posto(db: AsyncSession, user: User, f: Filtros) -> Relatorio:
    abasts = (
        await db.execute(
            select(Abastecimento.id, Abastecimento.fornecedor_id, Abastecimento.custo_total)
            .where(*_cond_abast(user, f), Abastecimento.modalidade == "POSTO_CREDENCIADO")
        )
    ).all()
    ids = [r[0] for r in abasts]
    notas: dict = defaultdict(dict)
    if ids:
        for n in (await db.execute(
            select(NotaAbastecimento).where(NotaAbastecimento.abastecimento_id.in_(ids), NotaAbastecimento.ativo.is_(True))
        )).scalars():
            notas[n.abastecimento_id][n.tipo] = n
    postos = dict((await db.execute(
        select(Fornecedor.id, func.coalesce(Fornecedor.nome_fantasia, Fornecedor.razao_social)).where(Fornecedor.organization_id == user.organization_id)
    )).all())
    g: dict = defaultdict(lambda: defaultdict(float))
    for aid, fid, valor in abasts:
        x = g[fid]
        n = notas.get(aid, {})
        x["abast"] += 1
        x["valor"] += _f(valor)
        if not n:
            x["sem"] += 1
            x["valor_sem"] += _f(valor)
            continue
        x["com"] += 1
        if "NFE_XML" not in n:
            x["so_pdf"] += 1
        if any(v.versao > 1 for v in n.values()):
            x["subst"] += 1
        if any(v.avisos for v in n.values()):
            x["aviso"] += 1
    linhas = [
        {
            "posto": postos.get(fid, "Não informado"), "abast": int(x["abast"]), "com": int(x["com"]), "sem": int(x["sem"]),
            "so_pdf": int(x["so_pdf"]), "subst": int(x["subst"]), "aviso": int(x["aviso"]),
            "pct": round(x["com"] * 100 / x["abast"], 1) if x["abast"] else 0.0,
            "valor": round(x["valor"], 2), "valor_sem": round(x["valor_sem"], 2),
        }
        for fid, x in g.items()
    ]
    linhas.sort(key=lambda r: -r["valor_sem"])
    tot = lambda k: sum(r[k] for r in linhas)  # noqa: E731
    return Relatorio(
        colunas=[
            Col("posto", "Posto", peso=20), Col("abast", "Abastecimentos", "inteiro", 8, True),
            Col("com", "Com nota", "inteiro", 7, True), Col("sem", "Sem nota", "inteiro", 7, True),
            Col("subst", "Substituídas", "inteiro", 7, True),
            Col("aviso", "Com divergência", "inteiro", 8, True), Col("pct", "% com nota", "pct", 7),
            Col("valor", "Valor total", "moeda", 10, True), Col("valor_sem", "Valor sem nota", "moeda", 10, True),
        ],
        linhas=linhas,
        resumo=[
            ("Abastecimentos em posto", _br(tot("abast"), 0)), ("Sem nota", _br(tot("sem"), 0)),
            ("Valor sem nota", _reais(tot("valor_sem"))), ("Com divergência", _br(tot("aviso"), 0)),
        ],
    )


@relatorio(
    "contratos", titulo="Contratos de posto", categoria="Controle",
    descricao="Litros e valor contratados, consumido (total e no período), saldo e contratos vencendo ou esgotando.",
    filtros=("periodo", "posto"), org=True,
)
async def contratos(db: AsyncSession, user: User, f: Filtros) -> Relatorio:
    cond = [ContratoPosto.organization_id == user.organization_id, ContratoPosto.deleted_at.is_(None)]
    if f.fornecedor_id:
        cond.append(ContratoPosto.fornecedor_id == f.fornecedor_id)
    lista = (await db.execute(
        select(ContratoPosto, func.coalesce(Fornecedor.nome_fantasia, Fornecedor.razao_social), Combustivel.nome)
        .join(Fornecedor, Fornecedor.id == ContratoPosto.fornecedor_id)
        .join(Combustivel, Combustivel.id == ContratoPosto.combustivel_id)
        .where(*cond).order_by(ContratoPosto.data_fim.nulls_last())
    )).all()
    ids = [c.id for c, *_ in lista]
    base = [Abastecimento.contrato_posto_id.in_(ids), Abastecimento.status == "CONFIRMADO", Abastecimento.deleted_at.is_(None)]
    total_c = dict((await db.execute(
        select(Abastecimento.contrato_posto_id, func.sum(Abastecimento.quantidade_litros)).where(*base).group_by(Abastecimento.contrato_posto_id)
    )).all()) if ids else {}
    periodo_c = dict((await db.execute(
        select(Abastecimento.contrato_posto_id, func.sum(Abastecimento.quantidade_litros))
        .where(*base, Abastecimento.data_abastecimento >= f.ini_dt, Abastecimento.data_abastecimento <= f.fim_dt)
        .group_by(Abastecimento.contrato_posto_id)
    )).all()) if ids else {}
    linhas = []
    for c, posto, comb in lista:
        contratado = _f(c.litros_contratados)
        usado = _f(total_c.get(c.id))
        saldo = contratado - usado
        pct = round(usado * 100 / contratado, 1) if contratado else 0.0
        dias = _dias(c.data_fim)
        if not c.ativo:
            sit = "Inativo"
        elif dias is not None and dias < 0:
            sit = "Vencido"
        elif saldo <= 0:
            sit = "Esgotado"
        elif pct >= 90 or (dias is not None and dias <= 30):
            sit = "Atenção"
        else:
            sit = "Em dia"
        linhas.append({
            "posto": posto, "numero": c.numero or "-", "combustivel": comb,
            "vigencia": f"{formatar_celula(c.data_inicio) if c.data_inicio else '-'} a {formatar_celula(c.data_fim) if c.data_fim else '-'}",
            "preco": _f(c.preco_litro), "contratado": contratado, "usado": round(usado, 2),
            "periodo": round(_f(periodo_c.get(c.id)), 2), "saldo": round(saldo, 2), "pct": pct,
            "valor_usado": round(usado * _f(c.preco_litro), 2), "situacao": sit,
        })
    atencao = sum(1 for r in linhas if r["situacao"] in ("Atenção", "Vencido", "Esgotado"))
    return Relatorio(
        colunas=[
            Col("posto", "Posto", peso=14), Col("numero", "Contrato", peso=7), Col("combustivel", "Combustível", peso=10),
            Col("vigencia", "Vigência", peso=12), Col("preco", "Preço/L", "moeda", 7),
            Col("contratado", "Contratado (L)", "numero", 8, True), Col("usado", "Consumido (L)", "numero", 8, True),
            Col("periodo", "No período (L)", "numero", 8, True), Col("saldo", "Saldo (L)", "numero", 8, True),
            Col("pct", "% usado", "pct", 6), Col("valor_usado", "Valor consumido", "moeda", 9, True),
            Col("situacao", "Situação", "situacao", 7),
        ],
        linhas=linhas,
        resumo=[
            ("Contratos", _br(len(linhas), 0)), ("Exigem atenção", _br(atencao, 0)),
            ("Saldo total", f"{_br(sum(r['saldo'] for r in linhas))} L"),
            ("Valor consumido", _reais(sum(r["valor_usado"] for r in linhas))),
        ],
    )


@relatorio(
    "alteracoes_km", titulo="Correções de quilometragem", categoria="Controle",
    descricao="Alterações manuais do km dos veículos: antes, depois, diferença, quem alterou e a justificativa.",
    filtros=("periodo", "unidade", "veiculo"),
)
async def alteracoes_km(db: AsyncSession, user: User, f: Filtros) -> Relatorio:
    lista = (await db.execute(
        select(AlteracaoQuilometragem, Veiculo)
        .join(Veiculo, Veiculo.id == AlteracaoQuilometragem.veiculo_id)
        .where(
            AlteracaoQuilometragem.organization_id == user.organization_id,
            AlteracaoQuilometragem.created_at >= f.ini_dt, AlteracaoQuilometragem.created_at <= f.fim_dt,
            *_cond_veiculo(user, f),
        ).order_by(AlteracaoQuilometragem.created_at.desc())
    )).all()
    usuarios = await _nomes_usuarios(db, [a.usuario_id for a, _ in lista])
    linhas = [
        {
            "data": to_display(a.created_at), "placa": v.placa, "veiculo": _veic_nome(v),
            "antes": a.km_anterior, "depois": a.km_novo, "dif": a.km_novo - a.km_anterior,
            "usuario": usuarios.get(a.usuario_id, "-"), "justificativa": a.justificativa or "-",
        }
        for a, v in lista
    ]
    return Relatorio(
        colunas=[
            Col("data", "Data", "datahora", 10), Col("placa", "Placa", peso=7), Col("veiculo", "Veículo", peso=12),
            Col("antes", "Km antes", "inteiro", 8), Col("depois", "Km depois", "inteiro", 8), Col("dif", "Diferença", "inteiro", 8),
            Col("usuario", "Alterado por", peso=12), Col("justificativa", "Justificativa", peso=28),
        ],
        linhas=linhas,
        resumo=[("Correções", _br(len(linhas), 0)), ("Reduções de km", _br(sum(1 for r in linhas if r["dif"] < 0), 0))],
    )


# ───────────────────────────── Frota ─────────────────────────────


async def _consumo_por_veiculo(db: AsyncSession, user: User, f: Filtros) -> dict:
    rows = (await db.execute(
        select(
            Abastecimento.veiculo_id, func.count(), func.sum(Abastecimento.quantidade_litros),
            func.sum(Abastecimento.custo_total), func.min(Abastecimento.quilometragem), func.max(Abastecimento.quilometragem),
            func.max(Abastecimento.data_abastecimento),
        ).where(*_cond_abast(user, f)).group_by(Abastecimento.veiculo_id)
    )).all()
    return {r[0]: r for r in rows}


@relatorio(
    "custo_veiculo", titulo="Custo por veículo", categoria="Frota",
    descricao="Combustível + manutenção, custo por km e consumo comparado com a média do mesmo modelo. Ordenado do mais caro.",
    filtros=("periodo", "unidade", "veiculo"),
)
async def custo_veiculo(db: AsyncSession, user: User, f: Filtros) -> Relatorio:
    veics = (await db.execute(select(Veiculo).where(*_cond_veiculo(user, f)))).scalars().all()
    cons = await _consumo_por_veiculo(db, user, f)
    manut = dict((await db.execute(
        select(Manutencao.veiculo_id, func.sum(Manutencao.valor_total)).where(
            Manutencao.organization_id == user.organization_id, Manutencao.deleted_at.is_(None),
            Manutencao.status != "CANCELADA", Manutencao.data_solicitacao >= f.inicio, Manutencao.data_solicitacao <= f.fim,
        ).group_by(Manutencao.veiculo_id)
    )).all())
    unidades = await _nomes_unidades(db, user.organization_id)
    linhas = []
    for v in veics:
        c = cons.get(v.id)
        litros = _f(c[2]) if c else 0.0
        comb = _f(c[3]) if c else 0.0
        km = (int(c[5] or 0) - int(c[4] or 0)) if c else 0
        man = _f(manut.get(v.id))
        if not (litros or man):
            continue
        linhas.append({
            "id": str(v.id), "placa": v.placa, "veiculo": _veic_nome(v), "modelo": (v.modelo or "").strip().upper(),
            "secretaria": unidades.get(v.unidade_id, "-"), "litros": round(litros, 2), "km": km if not v.usa_horimetro else None,
            "consumo": round(km / litros, 2) if km > 0 and litros and not v.usa_horimetro else None,
            "combustivel": round(comb, 2), "manutencao": round(man, 2), "total": round(comb + man, 2),
            "custo_km": round((comb + man) / km, 3) if km > 0 and not v.usa_horimetro else None,
        })
    medias: dict = defaultdict(list)
    for r in linhas:
        if r["consumo"] and r["modelo"]:
            medias[r["modelo"]].append(r["consumo"])
    for r in linhas:
        m = medias.get(r["modelo"])
        if r["consumo"] and m and len(m) >= 2:
            media = sum(m) / len(m)
            r["media_modelo"] = round(media, 2)
            r["var"] = round((r["consumo"] - media) * 100 / media, 1)
        else:
            r["media_modelo"] = None
            r["var"] = None
        r.pop("modelo")
    linhas.sort(key=lambda r: -r["total"])
    total = sum(r["total"] for r in linhas)
    km_tot = sum(r["km"] or 0 for r in linhas)
    return Relatorio(
        colunas=[
            Col("placa", "Placa", peso=7), Col("veiculo", "Veículo", peso=12), Col("secretaria", "Secretaria", peso=11),
            Col("km", "Km rodados", "inteiro", 7, True), Col("litros", "Litros", "numero", 7, True),
            Col("consumo", "km/L", "numero", 5), Col("media_modelo", "Média do modelo", "numero", 7),
            Col("var", "Dif. média (%)", "pct", 7), Col("combustivel", "Combustível", "moeda", 9, True),
            Col("manutencao", "Manutenção", "moeda", 9, True), Col("total", "Total", "moeda", 9, True),
            Col("custo_km", "Custo/km", "moeda", 7),
        ],
        linhas=linhas,
        resumo=[
            ("Veículos", _br(len(linhas), 0)), ("Custo total", _reais(total)),
            ("Custo médio/km", _reais(total / km_tot) if km_tot else "-"),
            ("Consumo abaixo da média (>10%)", _br(sum(1 for r in linhas if r["var"] is not None and r["var"] < -10), 0)),
        ],
        aviso="km/L negativo na coluna 'Dif. média' = consome mais que os outros veículos do mesmo modelo.",
        link="veiculo",
    )


@relatorio(
    "veiculos_parados", titulo="Veículos parados ou pouco usados", categoria="Frota",
    descricao="Veículos ativos sem abastecimento no período ou com pouco deslocamento. Apoia remanejamento e baixa.",
    filtros=("periodo", "unidade"),
)
async def veiculos_parados(db: AsyncSession, user: User, f: Filtros) -> Relatorio:
    veics = (await db.execute(select(Veiculo).where(*_cond_veiculo(user, f), Veiculo.situacao != "BAIXADO"))).scalars().all()
    cons = await _consumo_por_veiculo(db, user, f)
    ultimo = dict((await db.execute(
        select(Abastecimento.veiculo_id, func.max(Abastecimento.data_abastecimento)).where(
            Abastecimento.organization_id == user.organization_id, Abastecimento.status == "CONFIRMADO", Abastecimento.deleted_at.is_(None),
        ).group_by(Abastecimento.veiculo_id)
    )).all())
    unidades = await _nomes_unidades(db, user.organization_id)
    hoje = now_local().date()
    linhas = []
    for v in veics:
        c = cons.get(v.id)
        km = (int(c[5] or 0) - int(c[4] or 0)) if c else 0
        n = int(c[1]) if c else 0
        if n and (v.usa_horimetro or km >= 300):
            continue
        ult = to_display(ultimo[v.id]).date() if ultimo.get(v.id) else None
        linhas.append({
            "id": str(v.id), "placa": v.placa, "veiculo": _veic_nome(v), "secretaria": unidades.get(v.unidade_id, "-"),
            "situacao": v.situacao.replace("_", " ").capitalize(), "abast": n, "km": km if n else None,
            "ultimo": ult, "dias": (hoje - ult).days if ult else None,
            "motivo": "Sem abastecimento no período" if not n else "Menos de 300 km no período",
        })
    linhas.sort(key=lambda r: (r["dias"] is not None, -(r["dias"] or 0)))
    return Relatorio(
        colunas=[
            Col("placa", "Placa", peso=7), Col("veiculo", "Veículo", peso=13), Col("secretaria", "Secretaria", peso=12),
            Col("situacao", "Situação", peso=9), Col("abast", "Abastecimentos", "inteiro", 7), Col("km", "Km no período", "inteiro", 7),
            Col("ultimo", "Último abastecimento", "data", 9), Col("dias", "Dias sem abastecer", "inteiro", 8),
            Col("motivo", "Motivo", peso=14),
        ],
        linhas=linhas,
        resumo=[
            ("Veículos listados", _br(len(linhas), 0)),
            ("Sem abastecer no período", _br(sum(1 for r in linhas if not r["abast"]), 0)),
            ("Nunca abasteceram", _br(sum(1 for r in linhas if r["ultimo"] is None), 0)),
        ],
        link="veiculo",
    )


@relatorio(
    "documentos", titulo="Documentação dos veículos", categoria="Frota",
    descricao="Licenciamento, seguro e demais documentos: vencidos e a vencer em 60 dias (ou todos, com a data).",
    filtros=("unidade", "veiculo"), paisagem=False,
)
async def documentos(db: AsyncSession, user: User, f: Filtros) -> Relatorio:
    veics = {v.id: v for v in (await db.execute(select(Veiculo).where(*_cond_veiculo(user, f), Veiculo.situacao != "BAIXADO"))).scalars()}
    itens = []
    for v in veics.values():
        if v.vencimento_licenciamento:
            itens.append((v, "Licenciamento", v.vencimento_licenciamento))
        if v.vencimento_seguro:
            itens.append((v, "Seguro", v.vencimento_seguro))
    if veics:
        for d in (await db.execute(
            select(VeiculoDocumento).where(VeiculoDocumento.veiculo_id.in_(list(veics)), VeiculoDocumento.vencimento.isnot(None))
        )).scalars():
            itens.append((veics[d.veiculo_id], d.descricao or d.tipo or "Documento", d.vencimento))
    unidades = await _nomes_unidades(db, user.organization_id)
    linhas = []
    for v, doc, venc in itens:
        dias = _dias(venc)
        linhas.append({
            "id": str(v.id), "placa": v.placa, "veiculo": _veic_nome(v), "secretaria": unidades.get(v.unidade_id, "-"),
            "documento": doc, "vencimento": venc, "dias": dias, "situacao": _situacao_prazo(dias, 60),
        })
    linhas.sort(key=lambda r: r["dias"])
    sem = sum(1 for v in veics.values() if not v.vencimento_licenciamento)
    return Relatorio(
        colunas=[
            Col("placa", "Placa", peso=8), Col("veiculo", "Veículo", peso=14), Col("secretaria", "Secretaria", peso=12),
            Col("documento", "Documento", peso=12), Col("vencimento", "Vencimento", "data", 9),
            Col("dias", "Dias", "inteiro", 6), Col("situacao", "Situação", "situacao", 8),
        ],
        linhas=linhas,
        resumo=[
            ("Vencidos", _br(sum(1 for r in linhas if r["situacao"] == "Vencido"), 0)),
            ("A vencer (60 dias)", _br(sum(1 for r in linhas if r["situacao"] == "A vencer"), 0)),
            ("Veículos sem data de licenciamento", _br(sem, 0)),
        ],
        link="veiculo",
    )


@relatorio(
    "preventiva", titulo="Manutenção preventiva", categoria="Frota",
    descricao="Planos preventivos: atrasados, próximos e em dia, pelo km, horímetro ou data do plano.",
    filtros=("unidade", "veiculo"),
)
async def preventiva(db: AsyncSession, user: User, f: Filtros) -> Relatorio:
    lista = (await db.execute(
        select(PlanoPreventivo, Veiculo).join(Veiculo, Veiculo.id == PlanoPreventivo.veiculo_id)
        .where(PlanoPreventivo.organization_id == user.organization_id, PlanoPreventivo.deleted_at.is_(None),
               PlanoPreventivo.ativo.is_(True), *_cond_veiculo(user, f))
    )).all()
    hoje = now_local().date()
    linhas = []
    for p, v in lista:
        faltam, unidade, previsto, sit = None, "", "-", "Sem referência"
        if p.base == "QUILOMETRAGEM" and p.intervalo_km:
            alvo = (p.ultima_execucao_km or 0) + p.intervalo_km
            faltam, unidade, previsto = alvo - v.quilometragem_atual, "km", f"{formatar_celula(alvo)} km"
            sit = "Atrasada" if faltam < 0 else ("Próxima" if faltam <= p.intervalo_km * 0.1 else "Em dia")
        elif p.base == "HORIMETRO" and p.intervalo_horimetro:
            alvo = _f(p.ultima_execucao_horimetro) + _f(p.intervalo_horimetro)
            faltam, unidade, previsto = round(alvo - _f(v.horimetro_atual), 1), "h", f"{formatar_celula(alvo)} h"
            sit = "Atrasada" if faltam < 0 else ("Próxima" if faltam <= _f(p.intervalo_horimetro) * 0.1 else "Em dia")
        elif p.intervalo_meses and p.ultima_execucao_data:
            m = p.ultima_execucao_data.month - 1 + p.intervalo_meses
            ano, mes = p.ultima_execucao_data.year + m // 12, m % 12 + 1
            alvo_d = date(ano, mes, min(p.ultima_execucao_data.day, 28))
            faltam, unidade, previsto = (alvo_d - hoje).days, "dias", formatar_celula(alvo_d)
            sit = "Atrasada" if faltam < 0 else ("Próxima" if faltam <= 15 else "Em dia")
        linhas.append({
            "id": str(v.id), "placa": v.placa, "veiculo": _veic_nome(v), "plano": p.nome,
            "ultima": p.ultima_execucao_data, "previsto": previsto,
            "faltam": f"{formatar_celula(faltam)} {unidade}" if faltam is not None else "-",
            "situacao": sit, "_ord": {"Atrasada": 0, "Próxima": 1, "Sem referência": 2, "Em dia": 3}[sit],
        })
    linhas.sort(key=lambda r: (r.pop("_ord"), r["placa"]))
    return Relatorio(
        colunas=[
            Col("placa", "Placa", peso=7), Col("veiculo", "Veículo", peso=13), Col("plano", "Plano", peso=14),
            Col("ultima", "Última execução", "data", 9), Col("previsto", "Próxima em", peso=9),
            Col("faltam", "Faltam", peso=8), Col("situacao", "Situação", "situacao", 8),
        ],
        linhas=linhas,
        resumo=[
            ("Planos ativos", _br(len(linhas), 0)),
            ("Atrasados", _br(sum(1 for r in linhas if r["situacao"] == "Atrasada"), 0)),
            ("Próximos", _br(sum(1 for r in linhas if r["situacao"] == "Próxima"), 0)),
        ],
        link="veiculo",
    )


@relatorio(
    "ocorrencias", titulo="Ocorrências", categoria="Frota",
    descricao="Sinistros, multas, avarias e demais ocorrências por veículo, motorista e secretaria.",
    filtros=("periodo", "unidade", "veiculo", "motorista"),
)
async def ocorrencias(db: AsyncSession, user: User, f: Filtros) -> Relatorio:
    cond = [Ocorrencia.organization_id == user.organization_id, Ocorrencia.deleted_at.is_(None),
            Ocorrencia.data_ocorrencia >= f.inicio, Ocorrencia.data_ocorrencia <= f.fim, *_cond_veiculo(user, f)]
    if f.motorista_id:
        cond.append(Ocorrencia.motorista_id == f.motorista_id)
    lista = (await db.execute(
        select(Ocorrencia, Veiculo, Motorista.nome).join(Veiculo, Veiculo.id == Ocorrencia.veiculo_id)
        .outerjoin(Motorista, Motorista.id == Ocorrencia.motorista_id).where(*cond).order_by(Ocorrencia.data_ocorrencia.desc())
    )).all()
    unidades = await _nomes_unidades(db, user.organization_id)
    cap = lambda s: (s or "-").replace("_", " ").capitalize()  # noqa: E731
    linhas = [
        {
            "id": str(v.id), "data": o.data_ocorrencia, "placa": v.placa, "secretaria": unidades.get(v.unidade_id, "-"),
            "motorista": mot or "-", "categoria": cap(o.categoria), "gravidade": cap(o.gravidade),
            "situacao": cap(o.status), "descricao": o.descricao,
        }
        for o, v, mot in lista
    ]
    por_cat: dict = defaultdict(int)
    for r in linhas:
        por_cat[r["categoria"]] += 1
    principais = sorted(por_cat.items(), key=lambda x: -x[1])[:3]
    return Relatorio(
        colunas=[
            Col("data", "Data", "data", 8), Col("placa", "Placa", peso=7), Col("secretaria", "Secretaria", peso=11),
            Col("motorista", "Motorista", peso=12), Col("categoria", "Categoria", peso=9), Col("gravidade", "Gravidade", peso=7),
            Col("situacao", "Situação", "situacao", 8), Col("descricao", "Descrição", peso=28),
        ],
        linhas=linhas,
        resumo=[("Ocorrências", _br(len(linhas), 0))] + [(k, _br(n, 0)) for k, n in principais],
        link="veiculo",
    )


# ───────────────────────────── Combustível ─────────────────────────────


@relatorio(
    "entradas", titulo="Entradas de combustível", categoria="Combustível",
    descricao="Compras para o tanque próprio: nota, fornecedor, litros, preço e valor.",
    filtros=("periodo", "posto"), org=True,
)
async def entradas(db: AsyncSession, user: User, f: Filtros) -> Relatorio:
    cond = [EntradaCombustivel.organization_id == user.organization_id,
            EntradaCombustivel.data_entrada >= f.inicio, EntradaCombustivel.data_entrada <= f.fim]
    if f.fornecedor_id:
        cond.append(EntradaCombustivel.fornecedor_id == f.fornecedor_id)
    lista = (await db.execute(
        select(EntradaCombustivel, Tanque.nome, Combustivel.nome, func.coalesce(Fornecedor.nome_fantasia, Fornecedor.razao_social))
        .join(Tanque, Tanque.id == EntradaCombustivel.tanque_id).join(Combustivel, Combustivel.id == EntradaCombustivel.combustivel_id)
        .outerjoin(Fornecedor, Fornecedor.id == EntradaCombustivel.fornecedor_id).where(*cond).order_by(EntradaCombustivel.data_entrada.desc())
    )).all()
    linhas = [
        {
            "data": e.data_entrada, "tanque": tanque, "combustivel": comb, "fornecedor": forn or "-",
            "nota": f"{e.numero_nota or '-'}{'/' + e.serie_nota if e.serie_nota else ''}",
            "litros": None if e.cancelada else _f(e.quantidade_litros), "preco": _f(e.valor_por_litro) if e.valor_por_litro else None,
            "valor": None if e.cancelada else (_f(e.valor_total) if e.valor_total is not None else None),
            "situacao": f"Cancelada: {e.motivo_cancelamento or '-'}" if e.cancelada else "Válida",
        }
        for e, tanque, comb, forn in lista
    ]
    litros = sum(r["litros"] or 0 for r in linhas)
    valor = sum(r["valor"] or 0 for r in linhas)
    return Relatorio(
        colunas=[
            Col("data", "Data", "data", 8), Col("tanque", "Tanque", peso=11), Col("combustivel", "Combustível", peso=10),
            Col("fornecedor", "Fornecedor", peso=15), Col("nota", "Nota", peso=8), Col("litros", "Litros", "numero", 7, True),
            Col("preco", "Preço/L", "moeda", 7), Col("valor", "Valor", "moeda", 9, True), Col("situacao", "Situação", "situacao", 12),
        ],
        linhas=linhas,
        resumo=[("Entradas", _br(len(linhas), 0)), ("Litros", f"{_br(litros)} L"), ("Valor", _reais(valor)),
                ("Preço médio/L", _reais(valor / litros) if litros else "-")],
    )


@relatorio(
    "movimentacoes", titulo="Movimentação de estoque", categoria="Combustível",
    descricao="Extrato dos tanques próprios: entradas, saídas, transferências e ajustes, com saldo após cada lançamento.",
    filtros=("periodo",), org=True,
)
async def movimentacoes(db: AsyncSession, user: User, f: Filtros) -> Relatorio:
    lista = (await db.execute(
        select(MovimentacaoEstoque, Tanque.nome, Combustivel.nome)
        .join(Tanque, Tanque.id == MovimentacaoEstoque.tanque_destino_id).join(Combustivel, Combustivel.id == MovimentacaoEstoque.combustivel_id)
        .where(MovimentacaoEstoque.organization_id == user.organization_id,
               MovimentacaoEstoque.created_at >= f.ini_dt, MovimentacaoEstoque.created_at <= f.fim_dt)
        .order_by(MovimentacaoEstoque.created_at.desc())
    )).all()
    cap = lambda s: (s or "-").replace("_", " ").capitalize()  # noqa: E731
    linhas = [
        {
            "data": to_display(m.created_at), "tanque": tanque, "combustivel": comb, "tipo": cap(m.tipo), "origem": cap(m.origem),
            "entrada": _f(m.quantidade) if m.sinal > 0 else None, "saida": _f(m.quantidade) if m.sinal < 0 else None,
            "saldo": _f(m.saldo_apos) if m.saldo_apos is not None else None, "descricao": m.descricao or "-",
        }
        for m, tanque, comb in lista
    ]
    return Relatorio(
        colunas=[
            Col("data", "Data", "datahora", 9), Col("tanque", "Tanque", peso=11), Col("combustivel", "Combustível", peso=10),
            Col("tipo", "Tipo", peso=9), Col("origem", "Origem", peso=10), Col("entrada", "Entrada (L)", "numero", 7, True),
            Col("saida", "Saída (L)", "numero", 7, True), Col("saldo", "Saldo após (L)", "numero", 8), Col("descricao", "Descrição", peso=20),
        ],
        linhas=linhas,
        resumo=[("Lançamentos", _br(len(linhas), 0)), ("Entradas", f"{_br(sum(r['entrada'] or 0 for r in linhas))} L"),
                ("Saídas", f"{_br(sum(r['saida'] or 0 for r in linhas))} L")],
    )


@relatorio(
    "extrato_veiculo", titulo="Extrato do veículo", categoria="Frota",
    descricao="Tudo de um veículo no período: abastecimentos, manutenções e ocorrências, em ordem de data.",
    filtros=("periodo", "veiculo"), exige=("veiculo",),
)
async def extrato_veiculo(db: AsyncSession, user: User, f: Filtros) -> Relatorio:
    v = await db.scalar(select(Veiculo).where(Veiculo.id == f.veiculo_id, *_cond_veiculo(user, f)))
    if v is None:
        raise HTTPException(status_code=404, detail="Veículo não encontrado.")
    linhas = []
    for a, mot in (await db.execute(
        select(Abastecimento, Motorista.nome).outerjoin(Motorista, Motorista.id == Abastecimento.motorista_id)
        .where(*_cond_abast(user, f))
    )).all():
        linhas.append({
            "id": str(a.id), "data": to_display(a.data_abastecimento), "tipo": "Abastecimento",
            "descricao": f"{a.numero} · {mot or 'sem motorista'}", "km": a.quilometragem,
            "litros": _f(a.quantidade_litros), "valor": _f(a.custo_total) if a.custo_total is not None else None,
        })
    for m in (await db.execute(select(Manutencao).where(
        Manutencao.veiculo_id == v.id, Manutencao.deleted_at.is_(None), Manutencao.status != "CANCELADA",
        Manutencao.data_solicitacao >= f.inicio, Manutencao.data_solicitacao <= f.fim,
    ))).scalars():
        linhas.append({
            "id": None, "data": datetime.combine(m.data_solicitacao, time(12), tzinfo=get_tz()), "tipo": "Manutenção",
            "descricao": f"{m.tipo.capitalize()} · {m.status.replace('_', ' ').lower()} · {m.descricao_problema or ''}".strip(" ·"),
            "km": m.quilometragem, "litros": None, "valor": _f(m.valor_total),
        })
    for o in (await db.execute(select(Ocorrencia).where(
        Ocorrencia.veiculo_id == v.id, Ocorrencia.deleted_at.is_(None),
        Ocorrencia.data_ocorrencia >= f.inicio, Ocorrencia.data_ocorrencia <= f.fim,
    ))).scalars():
        linhas.append({
            "id": None, "data": datetime.combine(o.data_ocorrencia, time(12), tzinfo=get_tz()), "tipo": "Ocorrência",
            "descricao": f"{o.categoria.replace('_', ' ').capitalize()} · {o.descricao}", "km": o.quilometragem, "litros": None, "valor": None,
        })
    linhas.sort(key=lambda r: r["data"])
    kms = [r["km"] for r in linhas if r["tipo"] == "Abastecimento" and r["km"]]
    km = (max(kms) - min(kms)) if kms else 0
    valor = sum(r["valor"] or 0 for r in linhas)
    return Relatorio(
        colunas=[
            Col("data", "Data", "datahora", 9), Col("tipo", "Tipo", peso=9), Col("descricao", "Descrição", peso=34),
            Col("km", "Km", "inteiro", 7), Col("litros", "Litros", "numero", 6, True), Col("valor", "Valor", "moeda", 9, True),
        ],
        linhas=linhas,
        resumo=[
            ("Veículo", f"{v.placa} · {_veic_nome(v)}"), ("Km rodados", _br(km, 0)),
            ("Litros", f"{_br(sum(r['litros'] or 0 for r in linhas))} L"), ("Custo total", _reais(valor)),
            ("Custo/km", _reais(valor / km) if km else "-"),
        ],
        link="abastecimento",
    )


# ───────────────────────────── Pessoas ─────────────────────────────


@relatorio(
    "motoristas", titulo="Por motorista", categoria="Pessoas",
    descricao="Abastecimentos, litros, valor, veículos usados, ocorrências e situação da CNH de cada motorista.",
    filtros=("periodo", "unidade", "motorista"),
)
async def motoristas(db: AsyncSession, user: User, f: Filtros) -> Relatorio:
    ab = (await db.execute(
        select(Abastecimento.motorista_id, func.count(), func.sum(Abastecimento.quantidade_litros), func.sum(Abastecimento.custo_total),
               func.count(func.distinct(Abastecimento.veiculo_id)))
        .where(*_cond_abast(user, f), Abastecimento.motorista_id.isnot(None)).group_by(Abastecimento.motorista_id)
    )).all()
    oc = dict((await db.execute(
        select(Ocorrencia.motorista_id, func.count()).join(Veiculo, Veiculo.id == Ocorrencia.veiculo_id).where(
            Ocorrencia.organization_id == user.organization_id, Ocorrencia.deleted_at.is_(None), Ocorrencia.motorista_id.isnot(None),
            Ocorrencia.data_ocorrencia >= f.inicio, Ocorrencia.data_ocorrencia <= f.fim, filtro_escopo(user, Veiculo.unidade_id),
        ).group_by(Ocorrencia.motorista_id)
    )).all())
    ids = {r[0] for r in ab} | set(oc)
    if f.motorista_id:
        ids &= {f.motorista_id}
    mots = {m.id: m for m in (await db.execute(select(Motorista).where(Motorista.id.in_(ids)))).scalars()} if ids else {}
    por = {r[0]: r for r in ab}
    linhas = []
    for mid, m in mots.items():
        r = por.get(mid)
        dias = _dias(m.cnh_validade)
        linhas.append({
            "motorista": m.nome, "matricula": m.matricula or "-", "abast": int(r[1]) if r else 0,
            "litros": round(_f(r[2]), 2) if r else 0.0, "valor": round(_f(r[3]), 2) if r else 0.0,
            "veiculos": int(r[4]) if r else 0, "ocorrencias": int(oc.get(mid, 0)),
            "cnh": f"{m.cnh_categoria or '-'} · {formatar_celula(m.cnh_validade) if m.cnh_validade else 'sem validade'}",
            "situacao": _situacao_prazo(dias, 30) if m.cnh_validade else "Sem data",
        })
    linhas.sort(key=lambda r: -r["valor"])
    return Relatorio(
        colunas=[
            Col("motorista", "Motorista", peso=16), Col("matricula", "Matrícula", peso=7), Col("abast", "Abastecimentos", "inteiro", 7, True),
            Col("litros", "Litros", "numero", 7, True), Col("valor", "Valor", "moeda", 9, True), Col("veiculos", "Veículos", "inteiro", 6),
            Col("ocorrencias", "Ocorrências", "inteiro", 7, True), Col("cnh", "CNH", peso=11), Col("situacao", "Situação da CNH", "situacao", 8),
        ],
        linhas=linhas,
        resumo=[
            ("Motoristas", _br(len(linhas), 0)),
            ("CNH vencida", _br(sum(1 for r in linhas if r["situacao"] == "Vencido"), 0)),
            ("CNH a vencer (30 dias)", _br(sum(1 for r in linhas if r["situacao"] == "A vencer"), 0)),
        ],
    )


# ───────────────────────────── Secretarias ─────────────────────────────

MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


@relatorio(
    "comparativo_mensal", titulo="Comparativo mês a mês", categoria="Secretarias",
    descricao="Gasto com combustível por secretaria nos 12 meses até o fim do período, com a variação do último mês.",
    filtros=("fim", "unidade"),
)
async def comparativo_mensal(db: AsyncSession, user: User, f: Filtros) -> Relatorio:
    fim = f.fim
    meses = []
    a, m = fim.year, fim.month
    for _ in range(12):
        meses.append((a, m))
        m -= 1
        if m == 0:
            a, m = a - 1, 12
    meses.reverse()
    ini = datetime.combine(date(meses[0][0], meses[0][1], 1), time.min, tzinfo=get_tz())
    f2 = Filtros(**{**f.__dict__, "ini_dt": ini})
    rows = (await db.execute(
        select(Abastecimento.unidade_id, Abastecimento.data_abastecimento, Abastecimento.custo_total).where(*_cond_abast(user, f2))
    )).all()
    unidades = await _nomes_unidades(db, user.organization_id)
    tabela: dict = defaultdict(lambda: defaultdict(float))
    for uid, quando, v in rows:
        tabela[uid][to_display(quando).strftime("%Y-%m")] += _f(v)
    chaves = [f"{a}-{m:02d}" for a, m in meses]
    linhas = []
    for uid, vals in tabela.items():
        r = {"secretaria": unidades.get(uid, "Sem secretaria")}
        for k in chaves:
            r[k] = round(vals.get(k, 0.0), 2)
        ult, ant = r[chaves[-1]], r[chaves[-2]]
        r["var"] = round((ult - ant) * 100 / ant, 1) if ant else None
        r["total"] = round(sum(r[k] for k in chaves), 2)
        linhas.append(r)
    linhas.sort(key=lambda r: -r["total"])
    return Relatorio(
        colunas=[Col("secretaria", "Secretaria", peso=14)]
        + [Col(k, f"{MESES[int(k[5:]) - 1]}/{k[2:4]}", "moeda", 6, True) for k in chaves]
        + [Col("var", "Var. último mês (%)", "pct", 7), Col("total", "Total 12 meses", "moeda", 8, True)],
        linhas=linhas,
        resumo=[("Total 12 meses", _reais(sum(r["total"] for r in linhas))),
                ("Último mês", _reais(sum(r[chaves[-1]] for r in linhas)))],
        aviso="Considera abastecimentos confirmados (posto e tanque próprio).",
    )


# ───────────────────────────── Auditoria ─────────────────────────────


@relatorio(
    "auditoria", titulo="Trilha de auditoria", categoria="Auditoria",
    descricao="Quem fez o quê e quando: cadastros, correções, cancelamentos, notas e acessos, com justificativa e IP.",
    filtros=("periodo",), org=True,
)
async def auditoria(db: AsyncSession, user: User, f: Filtros) -> Relatorio:
    lista = (await db.execute(
        select(Auditoria).where(Auditoria.organization_id == user.organization_id,
                                Auditoria.created_at >= f.ini_dt, Auditoria.created_at <= f.fim_dt)
        .order_by(Auditoria.created_at.desc()).limit(5000)
    )).scalars().all()
    usuarios = await _nomes_usuarios(db, [a.usuario_id for a in lista])
    mot_ids = {a.motorista_id for a in lista if a.motorista_id}
    mots = dict((await db.execute(select(Motorista.id, Motorista.nome).where(Motorista.id.in_(mot_ids)))).all()) if mot_ids else {}
    linhas = [
        {
            "data": to_display(a.created_at),
            "quem": usuarios.get(a.usuario_id) or (f"Motorista {mots[a.motorista_id]}" if a.motorista_id in mots else "Sistema / posto"),
            "acao": a.acao.replace(".", " › ").replace("_", " "), "entidade": a.entidade.replace("_", " "),
            "justificativa": a.justificativa or "-", "ip": a.ip_address or "-",
        }
        for a in lista
    ]
    return Relatorio(
        colunas=[
            Col("data", "Data/hora", "datahora", 9), Col("quem", "Quem", peso=14), Col("acao", "Ação", peso=16),
            Col("entidade", "Registro", peso=9), Col("justificativa", "Justificativa", peso=24), Col("ip", "IP", peso=8),
        ],
        linhas=linhas,
        resumo=[("Eventos", _br(len(linhas), 0)), ("Pessoas", _br(len({r["quem"] for r in linhas}), 0))],
        aviso="Limitado aos 5.000 eventos mais recentes do período." if len(lista) >= 5000 else None,
    )


# ───────────────────────────── endpoints ─────────────────────────────


@router.get("")
async def listar(user: User = Depends(require_permission(Perm.REPORTS_VIEW, escopo=True))):
    restrito = escopo_unidades(user) is not None
    return [
        {"chave": k, "titulo": d.titulo, "categoria": d.categoria, "descricao": d.descricao,
         "filtros": list(d.filtros), "exige": list(d.exige)}
        for k, d in CATALOGO.items()
        if not (restrito and d.org)
    ]


def _uuid(v: str | None, nome: str) -> uuid.UUID | None:
    if not v:
        return None
    try:
        return uuid.UUID(v)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"{nome} inválido.")


@router.get("/{chave}")
async def gerar(
    chave: str,
    formato: str = "json",
    data_inicio: date | None = None,
    data_fim: date | None = None,
    unidade_id: str | None = None,
    veiculo_id: str | None = None,
    motorista_id: str | None = None,
    fornecedor_id: str | None = None,
    user: User = Depends(require_permission(Perm.REPORTS_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    d = CATALOGO.get(chave)
    if d is None:
        raise HTTPException(status_code=404, detail="Relatório não encontrado.")
    if d.org and escopo_unidades(user) is not None:
        raise HTTPException(status_code=403, detail="Relatório disponível só para a gestão da frota.")
    if formato not in ("json", "csv", "xlsx", "pdf"):
        raise HTTPException(status_code=422, detail="Formato inválido.")
    hoje = now_local().date()
    fim = data_fim or hoje
    inicio = data_inicio or fim.replace(day=1)
    if fim < inicio:
        raise HTTPException(status_code=422, detail="O fim do período é anterior ao início.")
    tz = get_tz()
    f = Filtros(
        inicio=inicio, fim=fim,
        unidade_id=_uuid(unidade_id, "Secretaria"), veiculo_id=_uuid(veiculo_id, "Veículo"),
        motorista_id=_uuid(motorista_id, "Motorista"), fornecedor_id=_uuid(fornecedor_id, "Posto"),
        ini_dt=datetime.combine(inicio, time.min, tzinfo=tz), fim_dt=datetime.combine(fim, time.max, tzinfo=tz),
    )
    if "veiculo" in d.exige and not f.veiculo_id:
        raise HTTPException(status_code=422, detail="Escolha o veículo.")
    rel = await d.fn(db, user, f)

    totais = {c.chave: round(sum(_f(r.get(c.chave)) for r in rel.linhas), 2) for c in rel.colunas if c.total}
    if formato == "json":
        return {
            "titulo": d.titulo, "periodo": {"inicio": inicio.isoformat(), "fim": fim.isoformat()},
            "colunas": [c.__dict__ for c in rel.colunas], "linhas": rel.linhas, "totais": totais,
            "resumo": [{"rotulo": k, "valor": v} for k, v in rel.resumo], "aviso": rel.aviso, "link": rel.link,
        }

    moedas = {i for i, c in enumerate(rel.colunas) if c.tipo == "moeda"}

    def valor(c: Col, r: dict):
        v = r.get(c.chave)
        if c.tipo == "datahora" and isinstance(v, datetime):
            return v.replace(tzinfo=None) if formato == "xlsx" else v
        if c.tipo == "pct" and v is not None:
            return f"{formatar_celula(v)}%" if formato != "xlsx" else v
        return v

    linhas = [[valor(c, r) for c in rel.colunas] for r in rel.linhas]
    linha_total = (
        [("Total" if i == 0 else totais.get(c.chave)) for i, c in enumerate(rel.colunas)] if totais else None
    )
    periodo = f"{formatar_celula(inicio)} a {formatar_celula(fim)}"
    if "periodo" not in d.filtros:
        periodo = f"Posição em {formatar_celula(hoje)}" if "fim" not in d.filtros else f"12 meses até {formatar_celula(fim)}"
    nomes = []
    for campo, modelo, attr, rot in (
        (f.unidade_id, Unidade, "nome", "Secretaria"), (f.veiculo_id, Veiculo, "placa", "Veículo"),
        (f.motorista_id, Motorista, "nome", "Motorista"), (f.fornecedor_id, Fornecedor, "razao_social", "Posto"),
    ):
        if campo and (obj := await db.get(modelo, campo)) is not None and obj.organization_id == user.organization_id:
            nomes.append(f"{rot}: {getattr(obj, attr)}")
    nome_arq = chave.replace("_", "-")

    if formato == "csv":
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=";")
        w.writerow([c.rotulo for c in rel.colunas])
        for ln in linhas:
            w.writerow([formatar_celula(v, i in moedas).replace("R$ ", "") if not isinstance(v, str) and v is not None else (v or "") for i, v in enumerate(ln)])
        return Response(content="﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{nome_arq}.csv"'})

    org_nome, cnpj, logo = await get_organizacao_meta(db, user.organization_id)
    meta = RelatorioMeta(titulo=d.titulo, organizacao=org_nome, cnpj=cnpj, logo=logo if formato == "pdf" else None,
                         periodo=periodo, filtros=nomes)
    if formato == "xlsx":
        datas = {i for i, c in enumerate(rel.colunas) if c.tipo == "data"}
        data = build_xlsx(meta, [c.rotulo for c in rel.colunas], linhas, currency_columns=moedas, date_columns=datas, totals=linha_total)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        data = build_pdf(
            meta, [c.rotulo for c in rel.colunas], linhas, usuario=user.name, currency_columns=moedas,
            paisagem=d.paisagem or len(rel.colunas) > 8, larguras=[c.peso for c in rel.colunas], totais=linha_total,
            resumo=rel.resumo or None, assinaturas=["Responsável pela emissão", "Gestor(a) da frota"],
        )
        media = "application/pdf"
    return Response(content=data, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{nome_arq}.{formato}"'})
