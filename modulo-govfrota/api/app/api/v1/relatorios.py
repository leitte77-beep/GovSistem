import csv
import io
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.core.timezone import utcnow
from app.models.abastecimento import Abastecimento
from app.models.auth_models import User
from app.models.combustivel import Combustivel, Tanque
from app.models.estoque import EntradaCombustivel, MovimentacaoEstoque
from app.models.manutencao import Manutencao
from app.models.motorista import Motorista
from app.models.ocorrencia import Ocorrencia
from app.models.veiculo import Veiculo
from app.services.exporters import (
    RelatorioMeta,
    build_pdf,
    build_xlsx,
    get_organizacao_nome,
)

router = APIRouter(prefix="/relatorios", tags=["relatórios"])


def _formato_response(
    formato: str,
    filename: str,
    meta: RelatorioMeta,
    headers: list[str],
    rows: list[list],
    *,
    currency_columns: set[int] | None = None,
    date_columns: set[int] | None = None,
    totals: list | None = None,
    sections: list | None = None,
    usuario: str = "-",
) -> Response:
    """Devolve JSON/XLSX/PDF conforme `formato`."""
    if formato == "xlsx":
        data = build_xlsx(
            meta, headers, rows, currency_columns=currency_columns,
            date_columns=date_columns, totals=totals,
        )
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif formato == "pdf":
        data = build_pdf(
            meta, headers, rows, usuario=usuario, currency_columns=currency_columns,
            totais=totals, sections=sections,
        )
        media = "application/pdf"
    else:
        return {"meta": meta.__dict__, "headers": headers, "rows": rows, "totals": totals}
    disp = filename if filename.endswith(".xlsx") else filename.replace(".xlsx", ".pdf")
    return Response(
        content=data,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{disp}"'},
    )


def _csv_response(filename: str, header: list[str], rows: list[list]) -> StreamingResponse:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    writer.writerows(rows)
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _parse_data(valor: str | None, fim: bool = False) -> datetime | None:
    if not valor:
        return None
    d = date.fromisoformat(valor)
    if fim:
        return datetime.combine(d, datetime.max.time()).replace(tzinfo=timezone.utc)
    return datetime.combine(d, datetime.min.time()).replace(tzinfo=timezone.utc)


@router.get("/abastecimentos")
async def relatorio_abastecimentos(
    formato: str = "json",
    veiculo_id: uuid.UUID | None = None,
    motorista_id: uuid.UUID | None = None,
    combustivel_id: uuid.UUID | None = None,
    tanque_id: uuid.UUID | None = None,
    centro_custo: str | None = None,
    data_inicio: str | None = None,
    data_fim: str | None = None,
    user: User = Depends(require_permission(Perm.REPORTS_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Abastecimentos por período com filtros combináveis (§32-§33)."""
    conditions = [
        Abastecimento.organization_id == user.organization_id,
        Abastecimento.status == "CONFIRMADO",
    ]
    if veiculo_id:
        conditions.append(Abastecimento.veiculo_id == veiculo_id)
    if motorista_id:
        conditions.append(Abastecimento.motorista_id == motorista_id)
    if combustivel_id:
        conditions.append(Abastecimento.combustivel_id == combustivel_id)
    if tanque_id:
        conditions.append(Abastecimento.tanque_id == tanque_id)
    di = _parse_data(data_inicio)
    df = _parse_data(data_fim, fim=True)
    if di:
        conditions.append(Abastecimento.data_abastecimento >= di)
    if df:
        conditions.append(Abastecimento.data_abastecimento <= df)

    stmt = (
        select(
            Abastecimento,
            Veiculo.placa.label("placa"),
            Motorista.nome.label("motorista"),
            Combustivel.nome.label("combustivel"),
            Tanque.nome.label("tanque"),
            Veiculo.centro_custo.label("centro_custo"),
        )
        .join(Veiculo, Abastecimento.veiculo_id == Veiculo.id)
        .outerjoin(Motorista, Abastecimento.motorista_id == Motorista.id)
        .join(Combustivel, Abastecimento.combustivel_id == Combustivel.id)
        .join(Tanque, Abastecimento.tanque_id == Tanque.id)
        .where(*conditions)
        .order_by(Abastecimento.data_abastecimento.desc())
    )
    if centro_custo:
        stmt = stmt.where(Veiculo.centro_custo == centro_custo)

    rows = (await db.execute(stmt.limit(5000))).all()

    dados = [
        {
            "data": r[0].data_abastecimento.isoformat(),
            "placa": r.placa,
            "motorista": r.motorista,
            "combustivel": r.combustivel,
            "tanque": r.tanque,
            "litros": float(r[0].quantidade_litros),
            "km": r[0].quilometragem,
            "consumo_km_l": float(r[0].consumo_km_l) if r[0].consumo_km_l else None,
            "custo_total": float(r[0].custo_total) if r[0].custo_total else None,
            "centro_custo": r.centro_custo,
            "origem": r[0].origem,
        }
        for r in rows
    ]

    total_litros = sum(d["litros"] for d in dados)
    total_custo = sum(d["custo_total"] or 0 for d in dados)

    if formato == "csv":
        return _csv_response(
            "abastecimentos.csv",
            ["Data", "Placa", "Motorista", "Combustível", "Tanque", "Litros", "KM", "Custo"],
            [
                [
                    d["data"], d["placa"], d["motorista"] or "-", d["combustivel"],
                    d["tanque"], d["litros"], d["km"], d["custo_total"] or "",
                ]
                for d in dados
            ],
        )
    if formato in ("xlsx", "pdf"):
        org_nome = await get_organizacao_nome(db, user.organization_id)
        meta = RelatorioMeta(
            titulo="Relatório de Abastecimentos",
            organizacao=org_nome,
            periodo=f"{data_inicio or 'início'} a {data_fim or 'hoje'}",
            filtros=[
                f"Veículo: {veiculo_id}" if veiculo_id else None,
                f"Motorista: {motorista_id}" if motorista_id else None,
                f"Combustível: {combustivel_id}" if combustivel_id else None,
                f"Tanque: {tanque_id}" if tanque_id else None,
                f"Centro de custo: {centro_custo}" if centro_custo else None,
            ],
        )
        rows = [
            [
                datetime.fromisoformat(d["data"]).replace(tzinfo=timezone.utc).astimezone().date(),
                d["placa"], d["motorista"] or "-", d["combustivel"], d["tanque"],
                d["litros"], d["km"], d["custo_total"] or 0,
            ]
            for d in dados
        ]
        return _formato_response(
            formato, "abastecimentos.xlsx", meta,
            ["Data", "Placa", "Motorista", "Combustível", "Tanque", "Litros (L)", "KM", "Custo (R$)"],
            rows,
            currency_columns={7}, date_columns={0},
            totals=[None, None, None, None, None, total_litros, None, total_custo],
            usuario=user.name,
        )
    return {"total_registros": len(dados), "total_litros": round(total_litros, 2), "total_gasto": round(total_custo, 2), "itens": dados}


@router.get("/veiculos/consumo")
async def relatorio_consumo_veiculos(
    data_inicio: str | None = None,
    data_fim: str | None = None,
    formato: str = "json",
    user: User = Depends(require_permission(Perm.REPORTS_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Relatório detalhado do veículo (§62): km rodados, litros, custo, custo/km."""
    di = _parse_data(data_inicio) or datetime.now(timezone.utc) - timedelta(days=90)
    df = _parse_data(data_fim, fim=True) or datetime.now(timezone.utc)

    abast_rows = (
        await db.execute(
            select(
                Abastecimento.veiculo_id,
                sa_func.min(Abastecimento.quilometragem),
                sa_func.max(Abastecimento.quilometragem),
                sa_func.sum(Abastecimento.quantidade_litros),
                sa_func.coalesce(sa_func.sum(Abastecimento.custo_total), 0),
            )
            .where(
                Abastecimento.organization_id == user.organization_id,
                Abastecimento.status == "CONFIRMADO",
                Abastecimento.data_abastecimento >= di,
                Abastecimento.data_abastecimento <= df,
            )
            .group_by(Abastecimento.veiculo_id)
        )
    ).all()

    manut_rows = (
        await db.execute(
            select(Manutencao.veiculo_id, sa_func.coalesce(sa_func.sum(Manutencao.valor_total), 0))
            .where(
                Manutencao.organization_id == user.organization_id,
                Manutencao.deleted_at.is_(None),
                Manutencao.status.in_(["CONCLUIDA", "EM_MANUTENCAO"]),
                Manutencao.data_solicitacao >= di.date(),
                Manutencao.data_solicitacao <= df.date(),
            )
            .group_by(Manutencao.veiculo_id)
        )
    ).all()
    manut_map = {str(v): float(c or 0) for v, c in manut_rows}

    itens = []
    for veiculo_id, km_min, km_max, litros, gasto in abast_rows:
        veiculo = await db.get(Veiculo, veiculo_id)
        if veiculo is None or veiculo.organization_id != user.organization_id:
            continue
        km_rodados = int(km_max - km_min) if km_max and km_min else 0
        litros_f = float(litros or 0)
        custo_comb = float(gasto or 0)
        custo_manut = manut_map.get(str(veiculo_id), 0.0)
        consumo_medio = round(km_rodados / litros_f, 2) if litros_f > 0 and km_rodados > 0 else None
        custo_km = round((custo_comb + custo_manut) / km_rodados, 2) if km_rodados > 0 else None
        itens.append(
            {
                "veiculo_id": str(veiculo_id),
                "placa": veiculo.placa,
                "modelo": f"{veiculo.marca or ''} {veiculo.modelo or ''}".strip(),
                "km_inicial": km_min,
                "km_final": km_max,
                "km_rodados": km_rodados,
                "litros": round(litros_f, 2),
                "valor_combustivel": round(custo_comb, 2),
                "consumo_medio": consumo_medio,
                "valor_manutencao": round(custo_manut, 2),
                "custo_total": round(custo_comb + custo_manut, 2),
                "custo_por_km": custo_km,
            }
        )

    if formato == "csv":
        return _csv_response(
            "consumo_veiculos.csv",
            ["Placa", "KM Inicial", "KM Final", "KM Rodados", "Litros", "Consumo Médio", "Combustível", "Manutenção", "Total", "Custo/KM"],
            [
                [
                    i["placa"], i["km_inicial"] or 0, i["km_final"] or 0, i["km_rodados"],
                    i["litros"], i["consumo_medio"] or "", i["valor_combustivel"],
                    i["valor_manutencao"], i["custo_total"], i["custo_por_km"] or "",
                ]
                for i in itens
            ],
        )
    if formato in ("xlsx", "pdf"):
        org_nome = await get_organizacao_nome(db, user.organization_id)
        meta = RelatorioMeta(
            titulo="Consumo por Veículo",
            organizacao=org_nome,
            periodo=f"{di.date().isoformat()} a {df.date().isoformat()}",
        )
        rows = [
            [
                i["placa"], i["modelo"], i["km_inicial"] or 0, i["km_final"] or 0,
                i["km_rodados"], i["litros"], i["consumo_medio"] or 0,
                i["valor_combustivel"], i["valor_manutencao"], i["custo_total"],
                i["custo_por_km"] or 0,
            ]
            for i in itens
        ]
        return _formato_response(
            formato, "consumo_veiculos.xlsx", meta,
            ["Placa", "Modelo", "KM Inicial", "KM Final", "KM Rodados", "Litros",
             "Consumo Médio", "Combustível (R$)", "Manutenção (R$)", "Total (R$)", "Custo/KM (R$)"],
            rows,
            currency_columns={7, 8, 9, 10},
            totals=[None, None, None, None,
                    round(sum(i["km_rodados"] for i in itens), 2),
                    round(sum(i["litros"] for i in itens), 2), None,
                    round(sum(i["valor_combustivel"] for i in itens), 2),
                    round(sum(i["valor_manutencao"] for i in itens), 2),
                    round(sum(i["custo_total"] for i in itens), 2), None],
            usuario=user.name,
        )
    return {"periodo": {"inicio": di.date().isoformat(), "fim": df.date().isoformat()}, "itens": itens}


@router.get("/motoristas/cnh")
async def relatorio_cnh(
    formato: str = "json",
    user: User = Depends(require_permission(Perm.REPORTS_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """CNHs vencendo e vencidas (§10)."""
    hoje = date.today()
    motoristas = (
        await db.execute(
            select(Motorista).where(
                Motorista.organization_id == user.organization_id,
                Motorista.deleted_at.is_(None),
                Motorista.ativo.is_(True),
                Motorista.cnh_validade.isnot(None),
            ).order_by(Motorista.cnh_validade)
        )
    ).scalars().all()
    itens = []
    for m in motoristas:
        dias = (m.cnh_validade - hoje).days
        itens.append(
            {
                "id": str(m.id),
                "nome": m.nome,
                "cnh_categoria": m.cnh_categoria,
                "cnh_validade": m.cnh_validade.isoformat(),
                "dias_restantes": dias,
                "situacao": "VENCIDA" if dias < 0 else ("CRITICA" if dias <= 7 else ("ATENCAO" if dias <= 30 else "OK")),
            }
        )
    if formato in ("xlsx", "pdf"):
        org_nome = await get_organizacao_nome(db, user.organization_id)
        meta = RelatorioMeta(
            titulo="Validade das CNHs",
            organizacao=org_nome,
            periodo=f"Emissão em {hoje.isoformat()}",
        )
        rows = [
            [i["nome"], i["cnh_categoria"] or "-", date.fromisoformat(i["cnh_validade"]),
             i["dias_restantes"], i["situacao"]]
            for i in itens
        ]
        return _formato_response(
            formato, "cnh.xlsx", meta,
            ["Nome", "Categoria", "Validade", "Dias restantes", "Situação"],
            rows, date_columns={2}, usuario=user.name,
        )
    return {"itens": itens}


@router.get("/estoque")
async def relatorio_estoque(
    formato: str = "json",
    user: User = Depends(require_permission(Perm.REPORTS_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Estoque atual por tanque + entradas do período."""
    tanques = (
        await db.execute(
            select(Tanque).where(
                Tanque.organization_id == user.organization_id,
                Tanque.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    entradas_mes = (
        await db.execute(
            select(
                EntradaCombustivel.combustivel_id,
                sa_func.sum(EntradaCombustivel.quantidade_litros),
                sa_func.coalesce(sa_func.sum(EntradaCombustivel.valor_total), 0),
            )
            .where(
                EntradaCombustivel.organization_id == user.organization_id,
                EntradaCombustivel.cancelada.is_(False),
                EntradaCombustivel.created_at >= datetime.now(timezone.utc) - timedelta(days=30),
            )
            .group_by(EntradaCombustivel.combustivel_id)
        )
    ).all()

    tanques = [
        {
            "id": str(t.id),
            "nome": t.nome,
            "combustivel": t.combustivel.nome if t.combustivel else None,
            "capacidade": float(t.capacidade_maxima),
            "estoque_atual": float(t.estoque_atual),
            "estoque_minimo": float(t.estoque_minimo),
        }
        for t in tanques
    ]
    entradas = {str(cid): {"litros": float(l or 0), "valor": float(v)} for cid, l, v in entradas_mes}

    if formato in ("xlsx", "pdf"):
        org_nome = await get_organizacao_nome(db, user.organization_id)
        meta = RelatorioMeta(
            titulo="Relatório de Estoque",
            organizacao=org_nome,
            periodo=f"Entradas dos últimos 30 dias (até {datetime.now(timezone.utc).date().isoformat()})",
        )
        rows = [
            [t["nome"], t["combustivel"] or "-", t["capacidade"], t["estoque_atual"],
             t["estoque_minimo"],
             entradas.get(t["id"], {}).get("litros", 0),
             entradas.get(t["id"], {}).get("valor", 0)]
            for t in tanques
        ]
        return _formato_response(
            formato, "estoque.xlsx", meta,
            ["Tanque", "Combustível", "Capacidade (L)", "Estoque atual (L)",
             "Estoque mínimo (L)", "Entradas 30d (L)", "Valor entradas 30d (R$)"],
            rows, currency_columns={2, 3, 4, 5, 6},
            totals=[None, None,
                    round(sum(t["capacidade"] for t in tanques), 2),
                    round(sum(t["estoque_atual"] for t in tanques), 2),
                    round(sum(t["estoque_minimo"] for t in tanques), 2),
                    round(sum(entradas.get(t["id"], {}).get("litros", 0) for t in tanques), 2),
                    round(sum(entradas.get(t["id"], {}).get("valor", 0) for t in tanques), 2)],
            usuario=user.name,
        )
    return {
        "tanques": tanques,
        "entradas_30d": entradas,
    }


@router.get("/manutencoes")
async def relatorio_manutencoes(
    formato: str = "json",
    status: str | None = None,
    tipo: str | None = None,
    data_inicio: str | None = None,
    data_fim: str | None = None,
    user: User = Depends(require_permission(Perm.REPORTS_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    from app.models.combustivel import Oficina

    conditions = [
        Manutencao.organization_id == user.organization_id,
        Manutencao.deleted_at.is_(None),
    ]
    if status:
        conditions.append(Manutencao.status == status.upper())
    if tipo:
        conditions.append(Manutencao.tipo == tipo.upper())
    if data_inicio:
        conditions.append(Manutencao.data_solicitacao >= date.fromisoformat(data_inicio))
    if data_fim:
        conditions.append(Manutencao.data_solicitacao <= date.fromisoformat(data_fim))

    rows = (
        await db.execute(
            select(
                Manutencao,
                Veiculo.placa.label("placa"),
                Oficina.nome.label("oficina"),
            )
            .join(Veiculo, Manutencao.veiculo_id == Veiculo.id)
            .outerjoin(Oficina, Manutencao.oficina_id == Oficina.id)
            .where(*conditions)
            .order_by(Manutencao.data_solicitacao.desc())
            .limit(2000)
        )
    ).all()

    itens = [
        {
            "id": str(m.id),
            "placa": placa,
            "tipo": m.tipo,
            "status": m.status,
            "oficina": oficina,
            "data_solicitacao": m.data_solicitacao.isoformat(),
            "data_conclusao": m.data_conclusao.isoformat() if m.data_conclusao else None,
            "valor_total": float(m.valor_total),
        }
        for m, placa, oficina in rows
    ]
    if formato == "csv":
        return _csv_response(
            "manutencoes.csv",
            ["Placa", "Tipo", "Status", "Oficina", "Solicitação", "Conclusão", "Valor"],
            [[i["placa"], i["tipo"], i["status"], i["oficina"] or "-", i["data_solicitacao"], i["data_conclusao"] or "-", i["valor_total"]] for i in itens],
        )
    if formato in ("xlsx", "pdf"):
        org_nome = await get_organizacao_nome(db, user.organization_id)
        meta = RelatorioMeta(
            titulo="Relatório de Manutenções",
            organizacao=org_nome,
            periodo=f"{data_inicio or 'início'} a {data_fim or 'hoje'}",
            filtros=[
                f"Status: {status}" if status else None,
                f"Tipo: {tipo}" if tipo else None,
            ],
        )
        rows = [
            [i["placa"], i["tipo"], i["status"], i["oficina"] or "-",
             date.fromisoformat(i["data_solicitacao"]),
             date.fromisoformat(i["data_conclusao"]) if i["data_conclusao"] else "-",
             i["valor_total"]]
            for i in itens
        ]
        total_valor = round(sum(i["valor_total"] for i in itens), 2)
        return _formato_response(
            formato, "manutencoes.xlsx", meta,
            ["Placa", "Tipo", "Status", "Oficina", "Solicitação", "Conclusão", "Valor (R$)"],
            rows,
            currency_columns={6}, date_columns={4, 5},
            totals=[None, None, None, None, None, None, total_valor],
            usuario=user.name,
        )
    return {
        "total_registros": len(itens),
        "valor_total": round(sum(i["valor_total"] for i in itens), 2),
        "itens": itens,
    }


@router.get("/entradas")
async def relatorio_entradas(
    formato: str = "json",
    data_inicio: str | None = None,
    data_fim: str | None = None,
    user: User = Depends(require_permission(Perm.REPORTS_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Entradas de combustível (compras) por período."""
    conditions = [
        EntradaCombustivel.organization_id == user.organization_id,
        EntradaCombustivel.cancelada.is_(False),
    ]
    if data_inicio:
        conditions.append(EntradaCombustivel.data_entrada >= date.fromisoformat(data_inicio))
    if data_fim:
        conditions.append(EntradaCombustivel.data_entrada <= date.fromisoformat(data_fim))
    rows = (
        await db.execute(
            select(
                EntradaCombustivel,
                Tanque.nome.label("tanque"),
                Combustivel.nome.label("combustivel"),
            )
            .join(Tanque, EntradaCombustivel.tanque_id == Tanque.id)
            .join(Combustivel, EntradaCombustivel.combustivel_id == Combustivel.id)
            .where(*conditions)
            .order_by(EntradaCombustivel.data_entrada.desc())
        )
    ).all()
    itens = [
        {
            "data": e.data_entrada,
            "tanque": tanque_nome,
            "combustivel": combustivel_nome,
            "nota": e.numero_nota,
            "litros": float(e.quantidade_litros),
            "valor_total": float(e.valor_total or 0),
            "valor_por_litro": float(e.valor_por_litro) if e.valor_por_litro else None,
        }
        for e, tanque_nome, combustivel_nome in rows
    ]
    total_litros = round(sum(i["litros"] for i in itens), 2)
    total_valor = round(sum(i["valor_total"] for i in itens), 2)
    if formato in ("xlsx", "pdf"):
        org_nome = await get_organizacao_nome(db, user.organization_id)
        meta = RelatorioMeta(
            titulo="Entradas de Combustível",
            organizacao=org_nome,
            periodo=f"{data_inicio or 'início'} a {data_fim or 'hoje'}",
        )
        data = [
            [i["data"], i["tanque"], i["combustivel"], i["nota"] or "-",
             i["litros"], i["valor_por_litro"] or 0, i["valor_total"]]
            for i in itens
        ]
        return _formato_response(
            formato, "entradas.xlsx", meta,
            ["Data", "Tanque", "Combustível", "NF", "Litros (L)",
             "Valor/Litro (R$)", "Valor Total (R$)"],
            data, currency_columns={4, 5, 6}, date_columns={0},
            totals=[None, None, None, None, total_litros, None, total_valor],
            usuario=user.name,
        )
    return {"total_litros": total_litros, "total_valor": total_valor, "itens": itens}


@router.get("/movimentacoes")
async def relatorio_movimentacoes(
    formato: str = "json",
    tanque_id: uuid.UUID | None = None,
    data_inicio: str | None = None,
    data_fim: str | None = None,
    user: User = Depends(require_permission(Perm.REPORTS_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Movimentações de estoque do período."""
    conditions = [MovimentacaoEstoque.organization_id == user.organization_id]
    if tanque_id:
        conditions.append(MovimentacaoEstoque.tanque_destino_id == tanque_id)
    if data_inicio:
        di = _parse_data(data_inicio)
        conditions.append(MovimentacaoEstoque.created_at >= di)
    if data_fim:
        df = _parse_data(data_fim, fim=True)
        conditions.append(MovimentacaoEstoque.created_at <= df)
    rows = (
        await db.execute(
            select(MovimentacaoEstoque, Tanque.nome.label("tanque"), Combustivel.nome.label("combustivel"))
            .join(Tanque, MovimentacaoEstoque.tanque_destino_id == Tanque.id)
            .join(Combustivel, MovimentacaoEstoque.combustivel_id == Combustivel.id)
            .where(*conditions)
            .order_by(MovimentacaoEstoque.created_at.desc())
        )
    ).all()
    itens = [
        {
            "data": m.created_at.astimezone(timezone.utc).replace(tzinfo=timezone.utc),
            "tanque": tanque_nome,
            "combustivel": combustivel_nome,
            "tipo": m.tipo,
            "origem": m.origem,
            "sinal": m.sinal,
            "quantidade": float(m.quantidade),
            "saldo_apos": float(m.saldo_apos) if m.saldo_apos is not None else None,
        }
        for m, tanque_nome, combustivel_nome in rows
    ]
    if formato in ("xlsx", "pdf"):
        org_nome = await get_organizacao_nome(db, user.organization_id)
        meta = RelatorioMeta(
            titulo="Movimentações de Estoque",
            organizacao=org_nome,
            periodo=f"{data_inicio or 'início'} a {data_fim or 'hoje'}",
            filtros=[f"Tanque: {tanque_id}" if tanque_id else None],
        )
        data = [
            [i["data"], i["tanque"], i["combustivel"], i["tipo"], i["origem"],
             "+" if i["sinal"] > 0 else "-", i["quantidade"], i["saldo_apos"] or 0]
            for i in itens
        ]
        return _formato_response(
            formato, "movimentacoes.xlsx", meta,
            ["Data", "Tanque", "Combustível", "Tipo", "Origem", "Sinal", "Quantidade (L)", "Saldo após (L)"],
            data, currency_columns={6, 7}, date_columns={0}, usuario=user.name,
        )
    return {"itens": itens}


@router.get("/veiculos/{veiculo_id}")
async def relatorio_veiculo_consolidado(
    veiculo_id: uuid.UUID,
    formato: str = "json",
    data_inicio: str | None = None,
    data_fim: str | None = None,
    user: User = Depends(require_permission(Perm.REPORTS_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Relatório consolidado do veículo (PDF/XLSX): identificação, período,
    indicadores, abastecimentos, manutenções e ocorrências."""
    veiculo = (
        await db.execute(
            select(Veiculo).where(
                Veiculo.id == veiculo_id,
                Veiculo.organization_id == user.organization_id,
                Veiculo.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if veiculo is None:
        raise HTTPException(status_code=404, detail="Veículo não encontrado.")

    di = _parse_data(data_inicio) or (utcnow() - timedelta(days=90))
    df = _parse_data(data_fim, fim=True) or utcnow()

    # Indicadores
    abast_resumo = (
        await db.execute(
            select(
                sa_func.min(Abastecimento.quilometragem),
                sa_func.max(Abastecimento.quilometragem),
                sa_func.sum(Abastecimento.quantidade_litros),
                sa_func.coalesce(sa_func.sum(Abastecimento.custo_total), 0),
                sa_func.sum(Abastecimento.custo_total),
            ).where(
                Abastecimento.organization_id == user.organization_id,
                Abastecimento.veiculo_id == veiculo.id,
                Abastecimento.status == "CONFIRMADO",
                Abastecimento.data_abastecimento >= di,
                Abastecimento.data_abastecimento <= df,
            )
        )
    ).one()
    km_min, km_max, litros, custo_comb = abast_resumo[0], abast_resumo[1], abast_resumo[2], abast_resumo[3]
    km_rodados = int(km_max - km_min) if km_max and km_min else 0
    litros_f = float(litros or 0)
    custo_comb_f = float(custo_comb or 0)

    manut_resumo = (
        await db.execute(
            select(sa_func.coalesce(sa_func.sum(Manutencao.valor_total), 0)).where(
                Manutencao.organization_id == user.organization_id,
                Manutencao.veiculo_id == veiculo.id,
                Manutencao.deleted_at.is_(None),
                Manutencao.status.in_(["CONCLUIDA", "EM_MANUTENCAO"]),
                Manutencao.data_solicitacao >= di.date(),
                Manutencao.data_solicitacao <= df.date(),
            )
        )
    ).scalar() or 0
    custo_manut_f = float(manut_resumo or 0)
    custo_total = round(custo_comb_f + custo_manut_f, 2)
    consumo_medio = round(km_rodados / litros_f, 2) if litros_f > 0 and km_rodados > 0 else None
    custo_por_km = round(custo_total / km_rodados, 2) if km_rodados > 0 else None

    abastecimentos = (
        await db.execute(
            select(Abastecimento, Motorista.nome.label("motorista"), Combustivel.nome.label("combustivel"), Tanque.nome.label("tanque"))
            .outerjoin(Motorista, Abastecimento.motorista_id == Motorista.id)
            .join(Combustivel, Abastecimento.combustivel_id == Combustivel.id)
            .join(Tanque, Abastecimento.tanque_id == Tanque.id)
            .where(
                Abastecimento.organization_id == user.organization_id,
                Abastecimento.veiculo_id == veiculo.id,
                Abastecimento.status == "CONFIRMADO",
                Abastecimento.data_abastecimento >= di,
                Abastecimento.data_abastecimento <= df,
            )
            .order_by(Abastecimento.data_abastecimento.desc())
        )
    ).all()
    manutencoes = (
        await db.execute(
            select(Manutencao).where(
                Manutencao.organization_id == user.organization_id,
                Manutencao.veiculo_id == veiculo.id,
                Manutencao.deleted_at.is_(None),
                Manutencao.data_solicitacao >= di.date(),
                Manutencao.data_solicitacao <= df.date(),
            ).order_by(Manutencao.data_solicitacao.desc())
        )
    ).scalars().all()
    ocorrencias = (
        await db.execute(
            select(Ocorrencia).where(
                Ocorrencia.organization_id == user.organization_id,
                Ocorrencia.veiculo_id == veiculo.id,
                Ocorrencia.deleted_at.is_(None),
                Ocorrencia.data_ocorrencia >= di.date(),
                Ocorrencia.data_ocorrencia <= df.date(),
            ).order_by(Ocorrencia.data_ocorrencia.desc())
        )
    ).scalars().all()

    identificacao = {
        "placa": veiculo.placa,
        "modelo": f"{veiculo.marca or ''} {veiculo.modelo or ''}".strip(),
        "ano": veiculo.ano_modelo or veiculo.ano_fabricacao,
        "centro_custo": veiculo.centro_custo,
        "departamento": veiculo.departamento,
    }
    indicadores = {
        "km_inicial": km_min,
        "km_final": km_max,
        "km_rodados": km_rodados,
        "litros": round(litros_f, 2),
        "valor_combustivel": round(custo_comb_f, 2),
        "consumo_medio": consumo_medio,
        "custo_manutencao": round(custo_manut_f, 2),
        "custo_total": custo_total,
        "custo_por_km": custo_por_km,
    }

    org_nome = await get_organizacao_nome(db, user.organization_id)
    meta = RelatorioMeta(
        titulo=f"Relatório Consolidado do Veículo — {veiculo.placa}",
        organizacao=org_nome,
        periodo=f"{di.date().isoformat()} a {df.date().isoformat()}",
    )

    if formato in ("xlsx", "pdf"):
        ident_headers = ["Placa", "Modelo", "Ano", "Centro de custo", "Departamento"]
        ident_row = [identificacao["placa"], identificacao["modelo"], identificacao["ano"] or "-",
                     identificacao["centro_custo"] or "-", identificacao["departamento"] or "-"]

        ind_headers = ["KM inicial", "KM final", "KM rodados", "Litros", "Valor comb. (R$)",
                       "Consumo médio", "Custo manutenção (R$)", "Custo total (R$)", "Custo/km (R$)"]
        ind_row = [indicadores["km_inicial"] or 0, indicadores["km_final"] or 0, indicadores["km_rodados"],
                   indicadores["litros"], indicadores["valor_combustivel"],
                   indicadores["consumo_medio"] or 0, indicadores["custo_manutencao"],
                   indicadores["custo_total"], indicadores["custo_por_km"] or 0]

        abast_rows = [
            [a.data_abastecimento.astimezone(timezone.utc).replace(tzinfo=timezone.utc),
             motorista or "-", float(a.quantidade_litros), a.quilometragem,
             float(a.custo_total or 0)]
            for a, motorista, _comb, _tanque in abastecimentos
        ]
        manut_rows = [
            [m.data_solicitacao, m.tipo, m.status, float(m.valor_total)] for m in manutencoes
        ]
        ocorr_rows = [
            [o.data_ocorrencia, o.categoria, o.gravidade, o.status, o.descricao[:60]]
            for o in ocorrencias
        ]

        sections = [
            ("Identificação", ident_headers, [ident_row]),
            ("Indicadores do Período", ind_headers, [ind_row]),
            ("Abastecimentos", ["Data", "Motorista", "Litros", "KM", "Custo (R$)"], abast_rows),
            ("Manutenções", ["Data", "Tipo", "Status", "Valor (R$)"], manut_rows),
            ("Ocorrências", ["Data", "Categoria", "Gravidade", "Status", "Descrição"], ocorr_rows),
        ]
        return _formato_response(
            formato, f"veiculo_{veiculo.placa}.xlsx", meta,
            ind_headers, [], usuario=user.name, sections=sections,
            currency_columns={3, 4, 6, 7, 8},
        )

    return {
        "veiculo_id": str(veiculo.id),
        "identificacao": identificacao,
        "periodo": {"data_inicio": di.date().isoformat(), "data_fim": df.date().isoformat()},
        "indicadores": indicadores,
        "abastecimentos": [
            {
                "data": a.data_abastecimento.isoformat(),
                "motorista": motorista,
                "litros": float(a.quantidade_litros),
                "km": a.quilometragem,
                "custo": float(a.custo_total or 0),
            }
            for a, motorista, _comb, _tanque in abastecimentos
        ],
        "manutencoes": [
            {"data": m.data_solicitacao.isoformat(), "tipo": m.tipo, "status": m.status, "valor": float(m.valor_total)}
            for m in manutencoes
        ],
        "ocorrencias": [
            {"data": o.data_ocorrencia.isoformat(), "categoria": o.categoria, "gravidade": o.gravidade, "status": o.status, "descricao": o.descricao}
            for o in ocorrencias
        ],
    }


# evita warning de import não usado em alguns linters
_ = Decimal
