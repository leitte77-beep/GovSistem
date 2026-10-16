"""Painel "Minha Secretaria": indicadores, gráficos, veículos e alertas das
secretarias do usuário (ou de uma delas). Valores gerenciais — a execução
orçamentária oficial fica no sistema de gestão municipal."""

import json
import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import escopo_unidades, filtro_escopo, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.core.timezone import ensure_aware, get_tz, now_local
from app.models.abastecimento import Abastecimento
from app.models.auth_models import User
from app.models.combustivel import Combustivel, Fornecedor
from app.models.motorista import Motorista
from app.models.unidade import Unidade
from app.models.veiculo import Veiculo
from app.services.abastecimento import ALERTAS

router = APIRouter(prefix="/secretaria", tags=["secretaria"])


def _periodo(inicio: date | None, fim: date | None) -> tuple[date, date]:
    hoje = now_local().date()
    inicio = inicio or hoje.replace(day=1)
    fim = fim or hoje
    if fim < inicio:
        raise HTTPException(status_code=422, detail="O fim do período é anterior ao início.")
    return inicio, fim


def _limites(inicio: date, fim: date) -> tuple[datetime, datetime]:
    tz = get_tz()
    return datetime.combine(inicio, time.min, tzinfo=tz), datetime.combine(fim, time.max, tzinfo=tz)


def _f(v) -> float:
    return float(v or 0)


@router.get("/painel")
async def painel(
    inicio: date | None = None,
    fim: date | None = None,
    unidade_id: uuid.UUID | None = None,
    user: User = Depends(require_permission(Perm.REFUELING_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    org = user.organization_id
    escopo = escopo_unidades(user)
    if unidade_id is not None and escopo is not None and unidade_id not in escopo:
        raise HTTPException(status_code=404, detail="Secretaria não encontrada.")
    di, df = _periodo(inicio, fim)
    ini_dt, fim_dt = _limites(di, df)

    # Secretarias disponíveis para o seletor (as do escopo, ou todas).
    unidades = (
        await db.execute(
            select(Unidade)
            .where(Unidade.organization_id == org, Unidade.deleted_at.is_(None), filtro_escopo(user, Unidade.id))
            .order_by(Unidade.nome)
        )
    ).scalars().all()

    def _cond_ab():
        c = [
            Abastecimento.organization_id == org,
            Abastecimento.deleted_at.is_(None),
            Abastecimento.status == "CONFIRMADO",
            filtro_escopo(user, Abastecimento.unidade_id),
        ]
        if unidade_id is not None:
            c.append(Abastecimento.unidade_id == unidade_id)
        elif escopo is None:
            # Visão geral: só o que tem secretaria (o painel é por secretaria).
            c.append(Abastecimento.unidade_id.isnot(None))
        return c

    no_periodo = [*_cond_ab(), Abastecimento.data_abastecimento >= ini_dt, Abastecimento.data_abastecimento <= fim_dt]

    registros = (
        await db.execute(
            select(Abastecimento, Combustivel.nome, Combustivel.categoria)
            .join(Combustivel, Combustivel.id == Abastecimento.combustivel_id)
            .where(*no_periodo)
            .order_by(Abastecimento.data_abastecimento)
        )
    ).all()

    # Veículos da(s) secretaria(s)
    cond_v = [Veiculo.organization_id == org, Veiculo.deleted_at.is_(None), filtro_escopo(user, Veiculo.unidade_id)]
    if unidade_id is not None:
        cond_v.append(Veiculo.unidade_id == unidade_id)
    elif escopo is None:
        cond_v.append(Veiculo.unidade_id.isnot(None))
    veiculos = (await db.execute(select(Veiculo).where(*cond_v).order_by(Veiculo.placa))).scalars().all()
    ids_veic = {v.id for v in veiculos} | {a.veiculo_id for a, _, _ in registros}
    todos_veic = {
        v.id: v for v in (await db.execute(select(Veiculo).where(Veiculo.id.in_(ids_veic)))).scalars()
    } if ids_veic else {}
    nomes_unid = {u.id: u.nome for u in unidades}

    # Agregados por veículo e por combustível
    por_veic: dict = defaultdict(lambda: {"abastecimentos": 0, "litros": 0.0, "litros_comb": 0.0, "gasto": 0.0,
                                          "km_min": None, "km_max": None, "combustiveis": set()})
    por_comb: dict = defaultdict(lambda: {"litros": 0.0, "gasto": 0.0, "abastecimentos": 0})
    com_alerta = []
    for a, comb_nome, categoria in registros:
        pv = por_veic[a.veiculo_id]
        pv["abastecimentos"] += 1
        pv["litros"] += _f(a.quantidade_litros)
        pv["gasto"] += _f(a.custo_total)
        pv["combustiveis"].add(comb_nome)
        if categoria == "COMBUSTIVEL":
            pv["litros_comb"] += _f(a.quantidade_litros)
            if a.quilometragem:
                pv["km_min"] = a.quilometragem if pv["km_min"] is None else min(pv["km_min"], a.quilometragem)
                pv["km_max"] = a.quilometragem if pv["km_max"] is None else max(pv["km_max"], a.quilometragem)
        pc = por_comb[comb_nome]
        pc["litros"] += _f(a.quantidade_litros)
        pc["gasto"] += _f(a.custo_total)
        pc["abastecimentos"] += 1
        if a.alertas:
            com_alerta.append(a)

    linhas_veic = []
    for vid in sorted(set(por_veic) | {v.id for v in veiculos}, key=lambda i: todos_veic[i].placa if i in todos_veic else ""):
        v = todos_veic.get(vid)
        if v is None:
            continue
        pv = por_veic.get(vid) or {"abastecimentos": 0, "litros": 0.0, "litros_comb": 0.0, "gasto": 0.0,
                                   "km_min": None, "km_max": None, "combustiveis": set()}
        km = (pv["km_max"] - pv["km_min"]) if pv["km_min"] is not None and not v.usa_horimetro else 0
        linhas_veic.append(
            {
                "veiculo_id": str(v.id),
                "placa": v.placa,
                "modelo": " ".join(x for x in (v.marca, v.modelo) if x) or None,
                "patrimonio": v.patrimonio,
                "secretaria": nomes_unid.get(v.unidade_id),
                "situacao": v.situacao,
                "combustiveis": sorted(pv["combustiveis"]),
                "hodometro": v.quilometragem_atual,
                "usa_horimetro": v.usa_horimetro,
                "abastecimentos": pv["abastecimentos"],
                "litros": round(pv["litros"], 2),
                "gasto": round(pv["gasto"], 2),
                "km_percorridos": km,
                "consumo_km_l": round(km / pv["litros_comb"], 2) if km and pv["litros_comb"] else None,
                "custo_por_km": round(pv["gasto"] / km, 2) if km else None,
            }
        )

    # Nota fiscal (só abastecimentos em posto: o posto envia a nota de cada um).
    from app.models.nota_abastecimento import NotaAbastecimento

    ids_posto = [a.id for a, _, _ in registros if a.modalidade == "POSTO_CREDENCIADO"]
    com_nota = set(
        (await db.execute(select(NotaAbastecimento.abastecimento_id).where(
            NotaAbastecimento.abastecimento_id.in_(ids_posto), NotaAbastecimento.ativo.is_(True)))).scalars()
    ) if ids_posto else set()
    notas_valor = {"COM_NOTA": 0.0, "SEM_NOTA": 0.0}
    for a, _, _ in registros:
        if a.modalidade == "POSTO_CREDENCIADO":
            notas_valor["COM_NOTA" if a.id in com_nota else "SEM_NOTA"] += _f(a.custo_total)

    km_total = sum(l["km_percorridos"] for l in linhas_veic)
    litros_comb_km = sum(por_veic[uuid.UUID(l["veiculo_id"])]["litros_comb"] for l in linhas_veic if l["km_percorridos"])
    gasto_km = sum(l["gasto"] for l in linhas_veic if l["km_percorridos"])
    gasto = sum(p["gasto"] for p in por_veic.values())
    litros = sum(p["litros"] for p in por_veic.values())

    # Últimos 12 meses (independe do período escolhido)
    hoje = now_local().date()
    a_m = hoje.year * 12 + hoje.month - 1 - 11  # 1º dia de 11 meses atrás: 12 meses contando o atual
    primeiro = date(a_m // 12, a_m % 12 + 1, 1)
    ini12, _ = _limites(primeiro, hoje)
    mensal_rows = (
        await db.execute(
            select(Abastecimento.data_abastecimento, Abastecimento.quantidade_litros, Abastecimento.custo_total,
                   Abastecimento.quilometragem, Abastecimento.veiculo_id)
            .where(*_cond_ab(), Abastecimento.data_abastecimento >= ini12)
        )
    ).all()
    tz = get_tz()
    meses: dict = {}
    m = primeiro
    while m <= hoje:
        meses[m.strftime("%Y-%m")] = {"mes": m.strftime("%Y-%m"), "gasto": 0.0, "litros": 0.0, "abastecimentos": 0}
        m = (m + timedelta(days=32)).replace(day=1)
    km_mes: dict = defaultdict(lambda: defaultdict(list))
    for data_ab, lit, custo, km, vid in mensal_rows:
        chave = ensure_aware(data_ab).astimezone(tz).strftime("%Y-%m")
        if chave in meses:
            meses[chave]["gasto"] += _f(custo)
            meses[chave]["litros"] += _f(lit)
            meses[chave]["abastecimentos"] += 1
            if km:
                km_mes[chave][vid].append(km)
    for chave, item in meses.items():
        km = sum(max(v) - min(v) for v in km_mes[chave].values() if len(v) > 1)
        item["gasto"] = round(item["gasto"], 2)
        item["litros"] = round(item["litros"], 2)
        item["custo_por_km"] = round(item["gasto"] / km, 2) if km else None

    # Alertas do período (indicadores para fiscalização, não decisões)
    placas = {v.id: v.placa for v in todos_veic.values()}
    placas_todas = placas
    ids_mot = {a.motorista_id for a in com_alerta if a.motorista_id}
    motoristas = dict(
        (await db.execute(select(Motorista.id, Motorista.nome).where(Motorista.id.in_(ids_mot)))).all()
    ) if ids_mot else {}
    ids_forn = {a.fornecedor_id for a in com_alerta if a.fornecedor_id}
    postos = {
        f.id: f.nome_fantasia or f.razao_social
        for f in (await db.execute(select(Fornecedor).where(Fornecedor.id.in_(ids_forn)))).scalars()
    } if ids_forn else {}
    alertas = []
    contagem_alertas: dict = defaultdict(int)
    for a in sorted(com_alerta, key=lambda x: x.data_abastecimento, reverse=True):
        try:
            codigos = list(json.loads(a.alertas))
        except (ValueError, TypeError):
            codigos = []
        for c in codigos:
            contagem_alertas[c] += 1
        alertas.append(
            {
                "abastecimento_id": str(a.id),
                "data": a.data_abastecimento.isoformat(),
                "placa": placas.get(a.veiculo_id),
                "motorista": motoristas.get(a.motorista_id),
                "local": postos.get(a.fornecedor_id) if a.fornecedor_id else "Tanque próprio",
                "litros": _f(a.quantidade_litros),
                "alertas": [{"codigo": c, "descricao": ALERTAS.get(c, c)} for c in codigos],
            }
        )

    # Motoristas que abasteceram veículos da(s) secretaria(s) no período.
    # Sem CPF/telefone: o secretário acompanha uso, não o cadastro pessoal.
    por_mot: dict = defaultdict(lambda: {"abastecimentos": 0, "litros": 0.0, "gasto": 0.0, "placas": set(), "ultimo": None})
    for a, _, _ in registros:
        if not a.motorista_id:
            continue
        pm = por_mot[a.motorista_id]
        pm["abastecimentos"] += 1
        pm["litros"] += _f(a.quantidade_litros)
        pm["gasto"] += _f(a.custo_total)
        pm["placas"].add(placas_todas.get(a.veiculo_id))
        pm["ultimo"] = a.data_abastecimento if pm["ultimo"] is None or a.data_abastecimento > pm["ultimo"] else pm["ultimo"]
    cad_mot = {
        m.id: m
        for m in (await db.execute(select(Motorista).where(Motorista.id.in_(set(por_mot))))).scalars()
    } if por_mot else {}
    hoje_local = now_local().date()
    motoristas_linhas = []
    for mid, pm in sorted(por_mot.items(), key=lambda x: -x[1]["gasto"]):
        m = cad_mot.get(mid)
        if m is None:
            continue
        validade = m.cnh_validade
        motoristas_linhas.append(
            {
                "motorista_id": str(m.id),
                "nome": m.nome,
                "matricula": m.matricula,
                "cnh_categoria": m.cnh_categoria,
                "cnh_validade": validade.isoformat() if validade else None,
                "cnh_vencida": bool(validade and validade < hoje_local),
                "ativo": m.ativo,
                "abastecimentos": pm["abastecimentos"],
                "litros": round(pm["litros"], 2),
                "gasto": round(pm["gasto"], 2),
                "veiculos": sorted(p for p in pm["placas"] if p),
                "ultimo_abastecimento": ensure_aware(pm["ultimo"]).isoformat() if pm["ultimo"] else None,
            }
        )

    return {
        "periodo": {"inicio": di.isoformat(), "fim": df.isoformat()},
        "motoristas": motoristas_linhas,
        "secretarias": [{"id": str(u.id), "nome": u.nome, "sigla": u.sigla} for u in unidades],
        "secretaria_id": str(unidade_id) if unidade_id else None,
        "restrito": escopo is not None,
        "indicadores": {
            "gasto": round(gasto, 2),
            "litros": round(litros, 2),
            "abastecimentos": len(registros),
            "veiculos_ativos": sum(1 for v in veiculos if v.situacao != "BAIXADO"),
            "km_percorridos": km_total,
            "custo_por_km": round(gasto_km / km_total, 2) if km_total else None,
            "consumo_km_l": round(km_total / litros_comb_km, 2) if km_total and litros_comb_km else None,
            "com_alerta": len(com_alerta),
            # Posto credenciado: valor com e sem nota fiscal enviada pelo posto.
            "valor_com_nota": round(notas_valor["COM_NOTA"], 2),
            "valor_sem_nota": round(notas_valor["SEM_NOTA"], 2),
        },
        "mensal": list(meses.values()),
        "por_combustivel": sorted(
            [{"combustivel": k, **{kk: round(vv, 2) if isinstance(vv, float) else vv for kk, vv in v.items()}}
             for k, v in por_comb.items()],
            key=lambda x: -x["litros"],
        ),
        "veiculos": linhas_veic,
        "alertas": alertas[:100],
        "alertas_por_tipo": [
            {"codigo": c, "descricao": ALERTAS.get(c, c), "quantidade": q}
            for c, q in sorted(contagem_alertas.items(), key=lambda x: -x[1])
        ],
        "aviso": (
            "Os valores apresentados possuem caráter gerencial. A execução orçamentária e "
            "financeira oficial permanece no sistema de gestão municipal."
        ),
    }


# ── Prestação de contas da secretaria (PDF / XLSX) ───────────────────────────


def _mesmo_dia_ano_anterior(d: date) -> date:
    try:
        return d.replace(year=d.year - 1)
    except ValueError:  # 29/02
        return d.replace(year=d.year - 1, day=28)


def _codigo_verificacao(org, unidade, di: date, df: date, total: float, emitido: str) -> str:
    import hashlib
    import hmac

    from app.core.config import settings

    msg = f"{org}|{unidade or ''}|{di.isoformat()}|{df.isoformat()}|{total:.2f}|{emitido}"
    return hmac.new(settings.SECRET_KEY.get_secret_value().encode(), msg.encode(), hashlib.sha256).hexdigest()[:16].upper()


async def _manutencoes(db: AsyncSession, user: User, ids_unid: list, di: date, df: date):
    """Manutenções do período (exceto canceladas) — mesmo critério do "Gasto por secretaria"."""
    from app.models.manutencao import Manutencao

    return (
        await db.execute(
            select(Manutencao, Veiculo.placa, Fornecedor)
            .join(Veiculo, Veiculo.id == Manutencao.veiculo_id)
            .outerjoin(Fornecedor, Fornecedor.id == Manutencao.fornecedor_id)
            .where(
                Manutencao.organization_id == user.organization_id,
                filtro_escopo(user, Manutencao.unidade_id),
                Manutencao.deleted_at.is_(None),
                Manutencao.status != "CANCELADA",
                Manutencao.unidade_id.in_(ids_unid),
                Manutencao.data_solicitacao >= di,
                Manutencao.data_solicitacao <= df,
            )
            .order_by(Manutencao.data_solicitacao)
        )
    ).all()


@router.get("/prestacao-contas")
async def prestacao_contas(
    request: Request,
    formato: str = "pdf",
    inicio: date | None = None,
    fim: date | None = None,
    unidade_id: uuid.UUID | None = None,
    user: User = Depends(require_permission(Perm.REFUELING_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    """Prestação de contas do período: combustível, manutenção, comparativos,
    pendências, veículos, motoristas e notas; PDF com gráficos, assinaturas e
    código de verificação. `formato=json` devolve a prévia mostrada na tela.

    Sem contratos: o contrato de combustível é da prefeitura, não da secretaria."""
    from fastapi import Response

    from app.core.timezone import to_display
    from app.models.nota_abastecimento import NotaAbastecimento
    from app.services.exporters import RelatorioMeta, build_pdf, build_xlsx_abas, get_organizacao_meta

    if formato not in ("pdf", "xlsx", "json"):
        raise HTTPException(status_code=422, detail="Formato deve ser pdf, xlsx ou json.")
    d = await painel(inicio=inicio, fim=fim, unidade_id=unidade_id, user=user, db=db)
    di, df = date.fromisoformat(d["periodo"]["inicio"]), date.fromisoformat(d["periodo"]["fim"])
    ids_unid = [uuid.UUID(s["id"]) for s in d["secretarias"]]
    if unidade_id is not None:
        ids_unid = [unidade_id]
    nomes_unid = {uuid.UUID(s["id"]): s["nome"] for s in d["secretarias"]}
    br = lambda v: round(float(v), 2) if v is not None else None  # noqa: E731

    # ── Manutenção ──
    manuts = await _manutencoes(db, user, ids_unid, di, df)
    manut_total = sum(_f(m.valor_total) for m, _, _ in manuts)
    manut_por_unid: dict = defaultdict(float)
    for m, _, _ in manuts:
        manut_por_unid[m.unidade_id] += _f(m.valor_total)

    # ── Comparativos: período anterior de mesma duração e mesmo período do ano passado ──
    dias = (df - di).days + 1
    periodos_cmp = {
        "anterior": (di - timedelta(days=dias), di - timedelta(days=1)),
        "ano_anterior": (_mesmo_dia_ano_anterior(di), _mesmo_dia_ano_anterior(df)),
    }
    cmp: dict = {}
    for chave, (ci, cf) in periodos_cmp.items():
        dc = await painel(inicio=ci, fim=cf, unidade_id=unidade_id, user=user, db=db)
        mc = sum(_f(m.valor_total) for m, _, _ in await _manutencoes(db, user, ids_unid, ci, cf))
        cmp[chave] = {"periodo": (ci, cf), "ind": dc["indicadores"], "manut": mc}

    i = d["indicadores"]
    total = i["gasto"] + manut_total

    def _ind(ind, manut):
        return {
            "Gasto total (R$)": ind["gasto"] + manut, "Combustível (R$)": ind["gasto"], "Manutenção (R$)": manut,
            "Litros": ind["litros"], "Abastecimentos": ind["abastecimentos"], "Km percorridos": ind["km_percorridos"],
            "Custo por km (R$)": ind["custo_por_km"], "Consumo médio (km/L)": ind["consumo_km_l"],
        }

    atual_ind = _ind(i, manut_total)
    ant_ind = _ind(cmp["anterior"]["ind"], cmp["anterior"]["manut"])
    ano_ind = _ind(cmp["ano_anterior"]["ind"], cmp["ano_anterior"]["manut"])

    def _var(a, b):
        if a is None or not b:
            return None
        return round((float(a) - float(b)) / float(b) * 100, 1)

    def _var_txt(v):
        return "—" if v is None else f"{'+' if v > 0 else ''}{v:.1f}%".replace(".", ",")

    comparativo = [[k, br(v), br(ant_ind[k]), _var(v, ant_ind[k]), br(ano_ind[k]), _var(v, ano_ind[k])] for k, v in atual_ind.items()]

    # ── Notas fiscais e pendências ──
    ini_n, fim_n = _limites(di, df)
    notas_periodo = (
        await db.execute(
            select(NotaAbastecimento, Abastecimento, Fornecedor, Veiculo.placa)
            .join(Abastecimento, Abastecimento.id == NotaAbastecimento.abastecimento_id)
            .join(Fornecedor, Fornecedor.id == NotaAbastecimento.fornecedor_id)
            .join(Veiculo, Veiculo.id == Abastecimento.veiculo_id)
            .where(
                NotaAbastecimento.organization_id == user.organization_id,
                NotaAbastecimento.tipo == "NFE_XML", NotaAbastecimento.ativo.is_(True),
                Abastecimento.unidade_id.in_(ids_unid),
                Abastecimento.status == "CONFIRMADO", Abastecimento.deleted_at.is_(None),
                Abastecimento.data_abastecimento >= ini_n, Abastecimento.data_abastecimento <= fim_n,
            )
            .order_by(Abastecimento.data_abastecimento)
        )
    ).all()
    com_nota_ativa = select(NotaAbastecimento.abastecimento_id).where(NotaAbastecimento.ativo.is_(True))
    sem_nota = (
        await db.execute(
            select(Abastecimento, Fornecedor, Veiculo.placa)
            .join(Veiculo, Veiculo.id == Abastecimento.veiculo_id)
            .outerjoin(Fornecedor, Fornecedor.id == Abastecimento.fornecedor_id)
            .where(
                Abastecimento.organization_id == user.organization_id,
                filtro_escopo(user, Abastecimento.unidade_id),
                Abastecimento.modalidade == "POSTO_CREDENCIADO",
                Abastecimento.status == "CONFIRMADO", Abastecimento.deleted_at.is_(None),
                Abastecimento.unidade_id.in_(ids_unid),
                Abastecimento.data_abastecimento >= ini_n, Abastecimento.data_abastecimento <= fim_n,
                Abastecimento.id.not_in(com_nota_ativa),
            )
            .order_by(Abastecimento.data_abastecimento)
        )
    ).all()

    def _data(dt):
        return f"{to_display(dt):%d/%m/%Y}"

    def _num(ab):
        return f"AB-{ab.numero_ano}/{ab.numero_seq:06d}"

    def _posto(p):
        return (p.nome_fantasia or p.razao_social) if p else "—"

    nfs = [[_data(ab.data_abastecimento), _posto(p), nomes_unid.get(ab.unidade_id, "—"), placa, n.nfe_numero or "—",
            br(n.nfe_valor_total), br(ab.custo_total)] for n, ab, p, placa in notas_periodo]
    divergentes = [[_data(ab.data_abastecimento), _num(ab), placa, _posto(p), n.nfe_numero or "—", br(n.nfe_valor_total),
                    br(ab.custo_total), br(_f(n.nfe_valor_total) - _f(ab.custo_total))]
                   for n, ab, p, placa in notas_periodo
                   if n.nfe_valor_total is not None and abs(_f(n.nfe_valor_total) - _f(ab.custo_total)) > 0.05]
    pend_sem_nota = [[_data(ab.data_abastecimento), _num(ab), placa, _posto(p), nomes_unid.get(ab.unidade_id, "—"),
                      br(ab.quantidade_litros), br(ab.custo_total)] for ab, p, placa in sem_nota]
    pend_alertas = [[f"{date.fromisoformat(a['data'][:10]):%d/%m/%Y}", a["placa"] or "—", a["motorista"] or "—", a["local"] or "—",
                     "; ".join(x["descricao"] for x in a["alertas"])] for a in d["alertas"]]
    pendencias = {
        "sem_nota": len(pend_sem_nota), "sem_nota_valor": round(sum(r[6] or 0 for r in pend_sem_nota), 2),
        "divergentes": len(divergentes), "com_alerta": i["com_alerta"],
    }

    # ── Pontos de atenção ──
    com_km = [v for v in d["veiculos"] if v["custo_por_km"]]
    maior_custo_km = sorted(com_km, key=lambda v: -v["custo_por_km"])[:5]
    pior_consumo = sorted([v for v in d["veiculos"] if v["consumo_km_l"]], key=lambda v: v["consumo_km_l"])[:5]
    maior_gasto = sorted([v for v in d["veiculos"] if v["gasto"]], key=lambda v: -v["gasto"])[:5]

    # ── Síntese em texto ──
    reais = lambda v: f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")  # noqa: E731
    num = lambda v, c=2: f"{v:,.{c}f}".replace(",", "X").replace(".", ",").replace("X", ".")  # noqa: E731
    secao_nome = nomes_unid.get(unidade_id) if unidade_id else None
    v_ant = _var(total, ant_ind["Gasto total (R$)"])
    frases = [
        f"No período de {di:%d/%m/%Y} a {df:%d/%m/%Y}, {('a ' + secao_nome) if secao_nome else 'a frota'} "
        f"registrou gasto total de {reais(total)}, sendo {reais(i['gasto'])} em combustível "
        f"({num(i['litros'])} litros em {i['abastecimentos']} abastecimentos) e {reais(manut_total)} em manutenção "
        f"({len(manuts)} {'serviço' if len(manuts) == 1 else 'serviços'})."
    ]
    if v_ant is not None:
        frases.append(f"Em relação ao período anterior de mesma duração, o gasto total {'aumentou' if v_ant > 0 else 'diminuiu'} "
                      f"{num(abs(v_ant), 1)}%.")
    if i["km_percorridos"]:
        frases.append(f"Foram percorridos {num(i['km_percorridos'], 0)} km"
                      + (f", com consumo médio de {num(i['consumo_km_l'])} km/L" if i["consumo_km_l"] else "")
                      + (f" e custo de combustível de {reais(i['custo_por_km'])} por km" if i["custo_por_km"] else "") + ".")
    if any(pendencias[k] for k in ("sem_nota", "divergentes", "com_alerta")):
        partes = []
        if pendencias["sem_nota"]:
            partes.append(f"{pendencias['sem_nota']} abastecimento(s) em posto sem nota fiscal ({reais(pendencias['sem_nota_valor'])})")
        if pendencias["divergentes"]:
            partes.append(f"{pendencias['divergentes']} nota(s) com valor diferente do abastecido")
        if pendencias["com_alerta"]:
            partes.append(f"{pendencias['com_alerta']} abastecimento(s) com alerta de conferência")
        frases.append("Há pendências a conferir: " + "; ".join(partes) + ".")
    else:
        frases.append("Não há pendências de nota fiscal nem alertas de conferência no período.")
    sintese = " ".join(frases)

    if formato == "json":
        return {
            "periodo": d["periodo"], "secretaria": secao_nome,
            "indicadores": {**{k: br(v) for k, v in atual_ind.items()}},
            "comparativo": [{"indicador": r[0], "atual": r[1], "anterior": r[2], "var_anterior": r[3],
                             "ano_anterior": r[4], "var_ano_anterior": r[5]} for r in comparativo],
            "pendencias": pendencias,
            "sintese": sintese,
        }

    # ── Tabelas (PDF e XLSX) ──
    comb = [[c["combustivel"], c["abastecimentos"], br(c["litros"]), br(c["gasto"])] for c in d["por_combustivel"]]
    veic_hdr = ["Placa", "Modelo", "Secretaria", "Abast.", "Litros", "Valor (R$)", "Km", "km/L", "R$/km"]
    veic_row = lambda v: [v["placa"], v["modelo"] or "—", v["secretaria"] or "—", v["abastecimentos"], br(v["litros"]),  # noqa: E731
                          br(v["gasto"]), v["km_percorridos"] or None, br(v["consumo_km_l"]), br(v["custo_por_km"])]
    veic = [veic_row(v) for v in d["veiculos"]]
    mots = [[m["nome"], m["matricula"] or "—", m["abastecimentos"], br(m["litros"]), br(m["gasto"]), ", ".join(m["veiculos"])]
            for m in d["motoristas"]]
    man_hdr = ["Data", "Placa", "Tipo", "Oficina", "Secretaria", "Situação", "Valor (R$)"]
    man_row = lambda m, placa, f: [f"{m.data_solicitacao:%d/%m/%Y}", placa, m.tipo.title(), _posto(f),  # noqa: E731
                                   nomes_unid.get(m.unidade_id, "—"), m.status.replace("_", " ").title(), br(m.valor_total)]
    man = [man_row(m, placa, f) for m, placa, f in manuts]
    mensal = [[m["mes"], br(m["gasto"]), br(m["litros"]), m["abastecimentos"]] for m in d["mensal"]]
    por_sec = []
    if unidade_id is None:
        gasto_sec: dict = defaultdict(lambda: [0.0, 0.0])
        for v in d["veiculos"]:
            gasto_sec[v["secretaria"] or "—"][0] += v["gasto"]
            gasto_sec[v["secretaria"] or "—"][1] += v["litros"]
        for uid, nome in nomes_unid.items():
            c, lt = gasto_sec.get(nome, [0.0, 0.0])
            mt = manut_por_unid.get(uid, 0.0)
            if c or mt:
                por_sec.append([nome, br(lt), br(c), br(mt), br(c + mt), round((c + mt) / total * 100, 1) if total else None])
        por_sec.sort(key=lambda r: -(r[4] or 0))
    comp_hdr = ["Indicador", "Período", "Período anterior", "Variação", "Mesmo período ano anterior", "Variação"]
    pi, pf = cmp["anterior"]["periodo"]
    ai, af = cmp["ano_anterior"]["periodo"]

    org_nome, cnpj, logo = await get_organizacao_meta(db, user.organization_id)
    meta = RelatorioMeta(
        titulo="Prestação de contas — frota",
        organizacao=org_nome, cnpj=cnpj, logo=logo,
        periodo=f"{di:%d/%m/%Y} a {df:%d/%m/%Y}",
        filtros=[f"Secretaria: {secao_nome or 'todas (consolidado)'}", d["aviso"]],
    )
    nome_arq = f"prestacao-contas-{di:%Y%m%d}-{df:%Y%m%d}"

    if formato == "xlsx":
        abas = [
            ("Síntese", ["Texto"], [[sintese]], set()),
            ("Comparativo", comp_hdr, comparativo, {1, 2, 4}),
            ("Por combustível", ["Combustível", "Abastecimentos", "Litros", "Valor (R$)"], comb, {3}),
            *([("Por secretaria", ["Secretaria", "Litros", "Combustível (R$)", "Manutenção (R$)", "Total (R$)", "Participação (%)"],
                por_sec, {2, 3, 4})] if por_sec else []),
            ("Veículos", veic_hdr, veic, {5}),
            ("Motoristas", ["Motorista", "Matrícula", "Abast.", "Litros", "Valor (R$)", "Veículos"], mots, {4}),
            ("Manutenções", man_hdr, man, {6}),
            ("Notas fiscais", ["Data", "Fornecedor", "Secretaria", "Placa", "NF-e", "Valor da nota (R$)", "Valor abastecido (R$)"], nfs, {5, 6}),
            ("Pend. sem nota", ["Data", "Número", "Placa", "Posto", "Secretaria", "Litros", "Valor (R$)"], pend_sem_nota, {6}),
            ("Pend. valor divergente", ["Data", "Número", "Placa", "Posto", "NF-e", "Valor nota (R$)", "Valor abastecido (R$)", "Diferença (R$)"], divergentes, {5, 6, 7}),
            ("Pend. alertas", ["Data", "Placa", "Motorista", "Local", "Alertas"], pend_alertas, set()),
            ("Últimos 12 meses", ["Mês", "Gasto (R$)", "Litros", "Abastecimentos"], mensal, {1}),
        ]
        return Response(content=build_xlsx_abas(meta, abas),
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": f'attachment; filename="{nome_arq}.xlsx"'})

    # ── PDF ──
    from xml.sax.saxutils import escape

    from reportlab.graphics.barcode.qr import QrCodeWidget
    from reportlab.graphics.charts.barcharts import HorizontalBarChart, VerticalBarChart
    from reportlab.graphics.shapes import Drawing, String
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import KeepTogether, PageBreak, Paragraph, Spacer, Table, TableStyle

    azul = colors.HexColor("#1D4ED8")
    txt = ParagraphStyle("Sint", fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=colors.HexColor("#111827"))
    nota = ParagraphStyle("Nota", fontName="Helvetica", fontSize=7.5, leading=10, textColor=colors.HexColor("#6B7280"))
    largura = 180 * mm

    def _pt(v):
        if v is None:
            return "—"
        if isinstance(v, float):
            return num(v)
        return v

    def _tab(rows, n_cols):
        return [[_pt(x) for x in r] for r in rows] or [["Nenhum registro."] + [""] * (n_cols - 1)]

    def _grafico_mensal():
        dados = [m["gasto"] for m in d["mensal"]]
        if not any(dados):
            return None
        dw = Drawing(largura, 60 * mm)
        ch = VerticalBarChart()
        ch.x, ch.y, ch.width, ch.height = 14 * mm, 8 * mm, largura - 18 * mm, 46 * mm
        ch.data = [dados]
        ch.bars[0].fillColor = azul
        ch.bars[0].strokeColor = None
        ch.categoryAxis.categoryNames = [f"{m['mes'][5:]}/{m['mes'][2:4]}" for m in d["mensal"]]
        ch.categoryAxis.labels.fontSize = 7
        ch.valueAxis.valueMin = 0
        ch.valueAxis.labels.fontSize = 7
        ch.valueAxis.labelTextFormat = lambda v: num(v / 1000, 0) + " mil" if v >= 1000 else num(v, 0)
        ch.valueAxis.strokeColor = ch.categoryAxis.strokeColor = colors.HexColor("#D1D5DB")
        dw.add(ch)
        dw.add(String(0, 57 * mm, "Gasto com combustível (R$) — últimos 12 meses", fontName="Helvetica", fontSize=7.5,
                      fillColor=colors.HexColor("#6B7280")))
        return dw

    def _grafico_secretarias():
        linhas = por_sec[:10]
        if len(linhas) < 2:
            return None
        altura = 10 * mm + 7 * mm * len(linhas)
        dw = Drawing(largura, altura)
        ch = HorizontalBarChart()
        ch.x, ch.y, ch.width, ch.height = 60 * mm, 4 * mm, largura - 75 * mm, altura - 8 * mm
        ch.data = [[r[2] or 0 for r in reversed(linhas)], [r[3] or 0 for r in reversed(linhas)]]
        ch.groupSpacing, ch.barSpacing = 3, 0
        ch.bars[0].fillColor, ch.bars[1].fillColor = azul, colors.HexColor("#F59E0B")
        ch.bars.strokeColor = None
        ch.categoryAxis.categoryNames = [r[0][:34] for r in reversed(linhas)]
        ch.categoryAxis.labels.fontSize = 7
        ch.categoryAxis.labels.boxAnchor = "e"
        ch.valueAxis.valueMin = 0
        ch.valueAxis.labels.fontSize = 7
        ch.valueAxis.labelTextFormat = lambda v: num(v / 1000, 0) + " mil" if v >= 1000 else num(v, 0)
        dw.add(ch)
        return dw

    def _legenda_sec():
        return Paragraph('<font color="#1D4ED8">■</font> Combustível &nbsp;&nbsp; <font color="#F59E0B">■</font> Manutenção', nota)

    sections: list = [
        (None, None, [Paragraph(escape(sintese), txt), Spacer(1, 4)]),
        ("Comparativo", comp_hdr, [[r[0], _pt(r[1]), _pt(r[2]), _var_txt(r[3]), _pt(r[4]), _var_txt(r[5])] for r in comparativo]),
        (None, None, [Paragraph(f"Período anterior: {pi:%d/%m/%Y} a {pf:%d/%m/%Y} · Ano anterior: {ai:%d/%m/%Y} a {af:%d/%m/%Y}", nota)]),
        ("Pendências a conferir", ["Pendência", "Quantidade", "Valor (R$)"], [
            ["Abastecimentos em posto sem nota fiscal", pendencias["sem_nota"], _pt(pendencias["sem_nota_valor"])],
            ["Notas com valor diferente do abastecido", pendencias["divergentes"], _pt(round(sum(r[7] or 0 for r in divergentes), 2))],
            ["Abastecimentos com alerta de conferência", pendencias["com_alerta"], "—"],
        ]),
    ]
    if pend_sem_nota:
        sections.append(("Abastecimentos sem nota fiscal", ["Data", "Número", "Placa", "Posto", "Secretaria", "Litros", "Valor (R$)"],
                         _tab(pend_sem_nota, 7)))
    if divergentes:
        sections.append(("Notas com valor divergente", ["Data", "Número", "Placa", "Posto", "NF-e", "Valor nota", "Abastecido", "Diferença"],
                         _tab(divergentes, 8)))
    if pend_alertas:
        sections.append(("Abastecimentos com alerta", ["Data", "Placa", "Motorista", "Local", "Alertas"], _tab(pend_alertas, 5)))
    g = _grafico_mensal()
    if g:
        sections.append(("Evolução mensal", None, [g]))
    sections.append(("Por combustível", ["Combustível", "Abastecimentos", "Litros", "Valor (R$)"], _tab(comb, 4)))
    if por_sec:
        sections.append(("Por secretaria", ["Secretaria", "Litros", "Combustível (R$)", "Manutenção (R$)", "Total (R$)", "%"],
                         _tab(por_sec, 6)))
        gs = _grafico_secretarias()
        if gs:
            sections.append((None, None, [gs, _legenda_sec()]))
    if maior_gasto:
        sections.append(("Pontos de atenção — maior gasto", ["Placa", "Modelo", "Secretaria", "Valor (R$)", "Litros"],
                         [[v["placa"], v["modelo"] or "—", v["secretaria"] or "—", _pt(v["gasto"]), _pt(v["litros"])] for v in maior_gasto]))
    if maior_custo_km:
        sections.append(("Pontos de atenção — maior custo por km", ["Placa", "Modelo", "Secretaria", "R$/km", "Km"],
                         [[v["placa"], v["modelo"] or "—", v["secretaria"] or "—", _pt(v["custo_por_km"]), v["km_percorridos"]] for v in maior_custo_km]))
    if pior_consumo:
        sections.append(("Pontos de atenção — pior consumo", ["Placa", "Modelo", "Secretaria", "km/L", "Litros"],
                         [[v["placa"], v["modelo"] or "—", v["secretaria"] or "—", _pt(v["consumo_km_l"]), _pt(v["litros"])] for v in pior_consumo]))
    sections += [
        ("Veículos", veic_hdr, _tab(veic, 9)),
        ("Manutenções", man_hdr, _tab(man, 7)),
        ("Motoristas", ["Motorista", "Matrícula", "Abast.", "Litros", "Valor (R$)", "Veículos"], _tab(mots, 6)),
        ("Notas fiscais", ["Data", "Fornecedor", "Secretaria", "Placa", "NF-e", "Valor da nota (R$)", "Valor abastecido (R$)"], _tab(nfs, 7)),
    ]

    # Consolidado com várias secretarias: uma página por secretaria, para separar e entregar.
    if unidade_id is None and len(por_sec) > 1:
        for uid, nome in nomes_unid.items():
            vs = [v for v in d["veiculos"] if v["secretaria"] == nome and (v["gasto"] or v["abastecimentos"])]
            ms = [r for (m, placa, f), r in zip(manuts, man) if m.unidade_id == uid]
            if not vs and not ms:
                continue
            c = sum(v["gasto"] for v in vs)
            mt = manut_por_unid.get(uid, 0.0)
            sections.append((None, None, [PageBreak()]))
            sections.append((f"Secretaria: {escape(nome)}", ["Combustível (R$)", "Litros", "Manutenção (R$)", "Total (R$)"],
                             [[_pt(round(c, 2)), _pt(round(sum(v["litros"] for v in vs), 2)), _pt(round(mt, 2)), _pt(round(c + mt, 2))]]))
            sections.append((f"Veículos — {escape(nome)}", veic_hdr, _tab([veic_row(v) for v in vs], 9)))
            if ms:
                sections.append((f"Manutenções — {escape(nome)}", man_hdr, _tab(ms, 7)))

    # Código de verificação (QR): confere período, secretaria e total na rota pública.
    emitido = meta.gerado_em.strftime("%Y%m%d%H%M%S")
    codigo = _codigo_verificacao(user.organization_id, unidade_id, di, df, total, emitido)
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "frota.govsistem.com.br"
    url = (f"https://{host}/api/govfrota/secretaria/prestacao-contas/verificar?o={user.organization_id}"
           f"&u={unidade_id or ''}&i={di.isoformat()}&f={df.isoformat()}&t={total:.2f}&e={emitido}&c={codigo}")
    qr = QrCodeWidget(url)
    b = qr.getBounds()
    lado = 24 * mm
    qd = Drawing(lado, lado, transform=[lado / (b[2] - b[0]), 0, 0, lado / (b[3] - b[1]), 0, 0])
    qd.add(qr)
    verif = Table([[qd, Paragraph(
        f"<b>Código de verificação: {codigo}</b><br/>Leia o QR code para conferir a autenticidade deste documento "
        f"(órgão, período, secretaria e total de {escape(reais(total))}).", nota)]], colWidths=[lado + 4 * mm, largura - lado - 4 * mm])
    verif.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB"))]))
    sections.append((None, None, [Spacer(1, 10), KeepTogether([verif])]))

    resumo = [("Gasto total", reais(total)), ("Combustível", reais(i["gasto"])), ("Manutenção", reais(manut_total)),
              ("Litros", num(i["litros"])), ("Km percorridos", num(i["km_percorridos"], 0))]
    assinaturas = ["Responsável pela frota", f"Secretário(a){' — ' + escape(secao_nome) if secao_nome else ''}", "Controle interno"]
    conteudo = build_pdf(meta, [], [], usuario=user.name, sections=sections, resumo=resumo, assinaturas=assinaturas)
    return Response(content=conteudo, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{nome_arq}.pdf"'})


@router.get("/prestacao-contas/verificar", response_class=HTMLResponse)
async def verificar_prestacao(o: uuid.UUID, i: date, f: date, t: str, e: str, c: str, u: str = "",
                              db: AsyncSession = Depends(get_db)):
    """Página pública aberta pelo QR code do PDF: confere se o documento é autêntico."""
    from html import escape

    from app.models.auth_models import Organization

    try:
        total = float(t)
        unidade = uuid.UUID(u) if u else None
    except ValueError:
        total, unidade = -1.0, None
    ok = total >= 0 and c.upper() == _codigo_verificacao(o, unidade, i, f, total, e)
    corpo = "<h1 style='color:#B42318'>Documento não reconhecido</h1><p>Os dados não conferem com nenhum relatório emitido pelo GovFrota. Pode ter sido alterado.</p>"
    if ok:
        org = await db.get(Organization, o)
        sec = await db.get(Unidade, unidade) if unidade else None
        try:
            em = datetime.strptime(e, "%Y%m%d%H%M%S").strftime("%d/%m/%Y %H:%M")
        except ValueError:
            em = e
        valor = f"R$ {total:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        corpo = (
            "<h1 style='color:#067647'>✓ Documento autêntico</h1>"
            f"<p><b>Prestação de contas — frota</b><br>{escape(org.name if org else '')}</p>"
            f"<p>Secretaria: {escape(sec.nome) if sec else 'todas (consolidado)'}<br>"
            f"Período: {i:%d/%m/%Y} a {f:%d/%m/%Y}<br>Gasto total: <b>{valor}</b><br>Emitido em: {em}</p>"
            "<p style='color:#6B7280;font-size:13px'>Confira se esses dados são os mesmos impressos no documento.</p>"
        )
    return HTMLResponse(
        "<!doctype html><html lang='pt-BR'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>Verificação de documento — GovFrota</title>"
        "<body style='font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#111827'>"
        f"{corpo}<p style='color:#9CA3AF;font-size:12px'>GovFrota · Gestão de Frotas</p></body></html>"
    )
