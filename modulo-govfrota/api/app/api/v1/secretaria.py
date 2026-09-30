"""Painel "Minha Secretaria": indicadores, gráficos, veículos e alertas das
secretarias do usuário (ou de uma delas). Valores gerenciais — a execução
orçamentária oficial fica no sistema de gestão municipal."""

import json
import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
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
    primeiro = (hoje.replace(day=1) - timedelta(days=335)).replace(day=1)
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


@router.get("/prestacao-contas")
async def prestacao_contas(
    formato: str = "pdf",
    inicio: date | None = None,
    fim: date | None = None,
    unidade_id: uuid.UUID | None = None,
    user: User = Depends(require_permission(Perm.REFUELING_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    """Relatório gerencial do período: consumo, veículos, motoristas, notas e contratos."""
    from fastapi import Response

    from app.models.combustivel import ContratoPosto
    from app.models.nota_abastecimento import NotaAbastecimento
    from app.models.veiculo import Veiculo as _Veiculo
    from app.services.exporters import RelatorioMeta, build_pdf, build_xlsx_abas, get_organizacao_nome

    if formato not in ("pdf", "xlsx"):
        raise HTTPException(status_code=422, detail="Formato deve ser pdf ou xlsx.")
    d = await painel(inicio=inicio, fim=fim, unidade_id=unidade_id, user=user, db=db)
    di, df = date.fromisoformat(d["periodo"]["inicio"]), date.fromisoformat(d["periodo"]["fim"])
    ids_unid = [uuid.UUID(s["id"]) for s in d["secretarias"]]
    if unidade_id is not None:
        ids_unid = [unidade_id]
    nomes_unid = {uuid.UUID(s["id"]): s["nome"] for s in d["secretarias"]}

    # Notas fiscais enviadas pelos postos para os abastecimentos do período.
    ini_n, fim_n = _limites(di, df)
    notas_periodo = (
        await db.execute(
            select(NotaAbastecimento, Abastecimento, Fornecedor, _Veiculo.placa)
            .join(Abastecimento, Abastecimento.id == NotaAbastecimento.abastecimento_id)
            .join(Fornecedor, Fornecedor.id == NotaAbastecimento.fornecedor_id)
            .join(_Veiculo, _Veiculo.id == Abastecimento.veiculo_id)
            .where(
                NotaAbastecimento.organization_id == user.organization_id,
                NotaAbastecimento.tipo == "NFE_XML", NotaAbastecimento.ativo.is_(True),
                Abastecimento.unidade_id.in_(ids_unid),
                Abastecimento.data_abastecimento >= ini_n, Abastecimento.data_abastecimento <= fim_n,
            )
            .order_by(Abastecimento.data_abastecimento)
        )
    ).all()

    # Contratos usados pelos abastecimentos do período.
    ini, fim_dt = _limites(di, df)
    ids_contr = set(
        (
            await db.execute(
                select(Abastecimento.contrato_posto_id).where(
                    Abastecimento.organization_id == user.organization_id,
                    Abastecimento.unidade_id.in_(ids_unid),
                    Abastecimento.contrato_posto_id.isnot(None),
                    Abastecimento.status == "CONFIRMADO",
                    Abastecimento.data_abastecimento >= ini,
                    Abastecimento.data_abastecimento <= fim_dt,
                )
            )
        ).scalars()
    )
    contratos = (
        await db.execute(
            select(ContratoPosto, Fornecedor, Combustivel.nome)
            .join(Fornecedor, Fornecedor.id == ContratoPosto.fornecedor_id)
            .join(Combustivel, Combustivel.id == ContratoPosto.combustivel_id)
            .where(ContratoPosto.id.in_(ids_contr))
        )
    ).all() if ids_contr else []

    i = d["indicadores"]
    # Números crus (XLSX soma e filtra); o PDF formata em pt-BR na saída.
    br = lambda v: round(float(v), 2) if v is not None else None  # noqa: E731
    secao_nome = nomes_unid.get(unidade_id) if unidade_id else ", ".join(s["nome"] for s in d["secretarias"])
    resumo = [
        ["Gasto no período (R$)", br(i["gasto"])], ["Litros consumidos", br(i["litros"])],
        ["Abastecimentos", i["abastecimentos"]], ["Veículos ativos", i["veiculos_ativos"]],
        ["Km percorridos", i["km_percorridos"]], ["Custo por km (R$)", br(i["custo_por_km"])],
        ["Consumo médio (km/L)", br(i["consumo_km_l"])], ["Abastecimentos com alerta", i["com_alerta"]],
        ["Em posto com nota fiscal (R$)", br(i.get("valor_com_nota"))], ["Em posto sem nota fiscal (R$)", br(i.get("valor_sem_nota"))],
    ]
    comb = [[c["combustivel"], c["abastecimentos"], br(c["litros"]), br(c["gasto"])] for c in d["por_combustivel"]]
    veic = [[v["placa"], v["modelo"] or "—", v["secretaria"] or "—", v["abastecimentos"], br(v["litros"]), br(v["gasto"]),
             v["km_percorridos"] or None, br(v["consumo_km_l"]), br(v["custo_por_km"])] for v in d["veiculos"]]
    mots = [[m["nome"], m["matricula"] or "—", m["abastecimentos"], br(m["litros"]), br(m["gasto"]), ", ".join(m["veiculos"])]
            for m in d["motoristas"]]
    nfs = [[f"{to_display(ab.data_abastecimento):%d/%m/%Y}", p.nome_fantasia or p.razao_social, nomes_unid.get(ab.unidade_id, "—"),
            placa, n.nfe_numero or "—", br(float(n.nfe_valor_total)) if n.nfe_valor_total is not None else None,
            br(float(ab.custo_total)) if ab.custo_total is not None else None]
           for n, ab, p, placa in notas_periodo]
    contr = [[c.numero or "—", p.nome_fantasia or p.razao_social, nome_comb, br(float(c.preco_litro)), br(float(c.litros_contratados))]
             for c, p, nome_comb in contratos]
    mensal = [[m["mes"], br(m["gasto"]), br(m["litros"]), m["abastecimentos"]] for m in d["mensal"]]

    meta = RelatorioMeta(
        titulo="Prestação de contas — frota",
        organizacao=await get_organizacao_nome(db, user.organization_id),
        periodo=f"{di:%d/%m/%Y} a {df:%d/%m/%Y}",
        filtros=[f"Secretaria: {secao_nome}" if secao_nome else None, d["aviso"]],
    )
    secoes = [
        ("Indicadores", ["Indicador", "Valor"], resumo, set()),
        ("Por combustível", ["Combustível", "Abastecimentos", "Litros", "Valor (R$)"], comb, {3}),
        ("Veículos", ["Placa", "Modelo", "Secretaria", "Abast.", "Litros", "Valor (R$)", "Km", "km/L", "R$/km"], veic, {5}),
        ("Motoristas", ["Motorista", "Matrícula", "Abast.", "Litros", "Valor (R$)", "Veículos"], mots, {4}),
        ("Notas fiscais", ["Data", "Fornecedor", "Secretaria", "Placa", "NF-e", "Valor da nota (R$)", "Valor abastecido (R$)"], nfs, {5, 6}),
        ("Contratos relacionados", ["Contrato", "Fornecedor", "Combustível", "Preço/L (R$)", "Litros contratados"], contr, {3}),
        ("Últimos 12 meses", ["Mês", "Gasto (R$)", "Litros", "Abastecimentos"], mensal, {1}),
    ]
    nome_arq = f"prestacao-contas-{di:%Y%m%d}-{df:%Y%m%d}"
    if formato == "xlsx":
        conteudo = build_xlsx_abas(meta, secoes)
        return Response(content=conteudo,
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": f'attachment; filename="{nome_arq}.xlsx"'})
    def _pt(v):
        if v is None:
            return "—"
        if isinstance(v, float):
            return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return v

    conteudo = build_pdf(
        meta, [], [], usuario=user.name,
        sections=[(n, h, [[_pt(x) for x in r] for r in rows] or [["—"] + [""] * (len(h) - 1)]) for n, h, rows, _ in secoes],
    )
    return Response(content=conteudo, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{nome_arq}.pdf"'})
