from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func as sa_func
from sqlalchemy import false as sa_false
from sqlalchemy import select
from sqlalchemy import true as sa_true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import escopo_unidades, filtro_escopo, get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.core.timezone import utcnow
from app.models.abastecimento import Abastecimento
from app.models.auth_models import Organization, User
from app.models.combustivel import Tanque
from app.models.estoque import EntradaCombustivel
from app.models.manutencao import Manutencao, PlanoPreventivo
from app.models.motorista import Motorista
from app.models.ocorrencia import Ocorrencia
from app.models.veiculo import Veiculo, VeiculoDocumento
from app.models.unidade import Unidade
from app.services.abastecimento import get_configuracoes
from app.services.alertas import autonomia_tanques, situacao_preventiva
from app.services.estoque import status_estoque

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
async def dashboard(
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    """Dashboard principal (§29) e visão executiva (§61).

    Usuário restrito a secretarias vê só os números delas; estoque de tanques,
    contratos e CNHs (dados da organização toda) ficam de fora para ele.
    """
    org = user.organization_id
    restrito = escopo_unidades(user) is not None
    veiculos_no_escopo = select(Veiculo.id).where(
        Veiculo.organization_id == org, filtro_escopo(user, Veiculo.unidade_id)
    )
    hoje = utcnow()
    # Fronteiras aware em UTC — nunca comparar datetime naive com coluna aware.
    inicio_dia = datetime.combine(hoje.date(), datetime.min.time()).replace(tzinfo=timezone.utc)
    inicio_mes = hoje.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # ── Frota ──
    situacoes_rows = (
        await db.execute(
            select(Veiculo.situacao, sa_func.count(Veiculo.id)).where(
                Veiculo.organization_id == org,
                filtro_escopo(user, Veiculo.unidade_id),
                Veiculo.deleted_at.is_(None),
            ).group_by(Veiculo.situacao)
        )
    ).all()
    frota_por_situacao = {s: c for s, c in situacoes_rows}
    total_veiculos = sum(frota_por_situacao.values())

    # ── Tanques / estoque visual (§31) ──
    tanques_rows = (
        await db.execute(
            select(Tanque)
            .where(
                Tanque.organization_id == org,
                sa_false() if restrito else sa_true(),
                Tanque.deleted_at.is_(None),
                # Tanque inativado sai do painel (continua no histórico).
                Tanque.ativo.is_(True),
            )
            .options(selectinload(Tanque.combustivel))
            .order_by(Tanque.nome)
        )
    ).scalars().all()
    autonomia = await autonomia_tanques(db, org) if tanques_rows else {}
    tanques = []
    for t in tanques_rows:
        capacidade = float(t.capacidade_maxima or 0)
        # Sem capacidade cadastrada não existe percentual válido — devolve null.
        percentual = round(float(t.estoque_atual / t.capacidade_maxima * 100), 1) if t.capacidade_maxima else None
        tanques.append(
            {
                "id": str(t.id),
                "nome": t.nome,
                "combustivel": t.combustivel.nome if t.combustivel else None,
                "capacidade": capacidade or None,
                "estoque_atual": float(t.estoque_atual),
                "estoque_minimo": float(t.estoque_minimo),
                "percentual": percentual,
                "status_estoque": status_estoque(Decimal(t.estoque_atual), Decimal(t.estoque_minimo)),
                "dias_autonomia": autonomia.get(t.id),
            }
        )

    # Sem tanque próprio: o "estoque" é o saldo contratado com os postos.
    contratos_posto = []
    if not tanques and not restrito:
        from app.core.timezone import now_local
        from app.models.combustivel import Combustivel, ContratoPosto, Fornecedor
        from app.services.contrato_posto import litros_consumidos

        data_local = now_local().date()
        linhas = (
            await db.execute(
                select(ContratoPosto, Fornecedor, Combustivel.nome)
                .join(Fornecedor, Fornecedor.id == ContratoPosto.fornecedor_id)
                .join(Combustivel, Combustivel.id == ContratoPosto.combustivel_id)
                .where(
                    ContratoPosto.organization_id == org,
                    ContratoPosto.deleted_at.is_(None),
                    ContratoPosto.ativo.is_(True),
                    Fornecedor.deleted_at.is_(None),
                    (ContratoPosto.data_inicio.is_(None)) | (ContratoPosto.data_inicio <= data_local),
                    (ContratoPosto.data_fim.is_(None)) | (ContratoPosto.data_fim >= data_local),
                )
                .order_by(Combustivel.nome)
            )
        ).all()
        consumidos = await litros_consumidos(db, [c.id for c, _, _ in linhas])
        for c, f, combustivel_nome in linhas:
            contratado = Decimal(c.litros_contratados)
            saldo = contratado - consumidos.get(c.id, Decimal("0"))
            contratos_posto.append(
                {
                    "id": str(c.id),
                    "fornecedor_id": str(f.id),
                    "posto": f.nome_fantasia or f.razao_social,
                    "combustivel": combustivel_nome,
                    "numero": c.numero,
                    "preco_litro": float(c.preco_litro),
                    "litros_contratados": float(contratado),
                    "saldo_litros": float(saldo),
                    "saldo_valor": float((saldo * Decimal(c.preco_litro)).quantize(Decimal("0.01"))),
                    "percentual": round(float(saldo / contratado * 100), 1) if contratado else None,
                    "data_fim": c.data_fim.isoformat() if c.data_fim else None,
                }
            )

    # ── Abastecimentos ──
    def _agg_abast(inicio: datetime | None):
        conditions = [
            Abastecimento.organization_id == org,
            filtro_escopo(user, Abastecimento.unidade_id),
            Abastecimento.status == "CONFIRMADO",
        ]
        if inicio:
            conditions.append(Abastecimento.data_abastecimento >= inicio)
        return select(
            sa_func.count(Abastecimento.id),
            sa_func.coalesce(sa_func.sum(Abastecimento.quantidade_litros), 0),
            sa_func.coalesce(sa_func.sum(Abastecimento.custo_total), 0),
        ).where(*conditions)

    stats_hoje = (await db.execute(_agg_abast(inicio_dia))).one()
    stats_mes = (await db.execute(_agg_abast(inicio_mes))).one()

    # ── Manutenções ──
    abertas = await db.scalar(
        select(sa_func.count(Manutencao.id)).where(
            Manutencao.organization_id == org,
            filtro_escopo(user, Manutencao.unidade_id),
            Manutencao.deleted_at.is_(None),
            Manutencao.status.in_(["ABERTA", "AGUARDANDO_ORCAMENTO", "APROVADA", "EM_MANUTENCAO"]),
        )
    ) or 0

    # Preventivas vencidas/próximas (km)
    planos = (
        await db.execute(
            select(PlanoPreventivo).where(
                PlanoPreventivo.organization_id == org,
                PlanoPreventivo.veiculo_id.in_(veiculos_no_escopo),
                PlanoPreventivo.deleted_at.is_(None),
                PlanoPreventivo.ativo.is_(True),
            )
        )
    ).scalars().all()
    if planos:
        plano_veiculo_ids = {p.veiculo_id for p in planos}
        veiculo_map = {
            v.id: v
            for v in (
                await db.execute(
                    select(Veiculo).where(Veiculo.id.in_(plano_veiculo_ids))
                )
            ).scalars()
        }
    else:
        veiculo_map = {}
    config = await get_configuracoes(db, org)
    preventivas_proximas = 0
    preventivas_vencidas = 0
    proximas_preventivas: list[dict] = []
    hoje_date = date.today()
    for plano in planos:
        veiculo = veiculo_map.get(plano.veiculo_id)
        if not veiculo:
            continue
        r = situacao_preventiva(plano, veiculo, config.antecedencia_alerta_manutencao_dias)
        if r["situacao"] is None:
            continue
        if r["situacao"] == "VENCIDA":
            preventivas_vencidas += 1
        elif r["situacao"] == "PROXIMA":
            preventivas_proximas += 1
        proximas_preventivas.append(
            {
                "plano_id": str(plano.id),
                "veiculo_id": str(veiculo.id),
                "placa": veiculo.placa,
                "modelo": f"{veiculo.marca or ''} {veiculo.modelo or ''}".strip() or None,
                "nome": plano.nome,
                "base": plano.base,
                "restante_km": r["restante_km"],
                "restante_horas": r["restante_horas"],
                "restante_dias": r["restante_dias"],
                "situacao": r["situacao"],
            }
        )

    def _ordem_preventiva(p: dict):
        prioridade = {"VENCIDA": 0, "PROXIMA": 1, "EM_DIA": 2}.get(p["situacao"], 3)
        if p["restante_km"] is not None:
            return (prioridade, p["restante_km"])
        if p["restante_horas"] is not None:
            return (prioridade, p["restante_horas"] * 10)
        return (prioridade, (p["restante_dias"] or 0) * 100)

    proximas_preventivas = [
        p for p in sorted(proximas_preventivas, key=_ordem_preventiva) if p["situacao"] != "EM_DIA"
    ][:6] or sorted(proximas_preventivas, key=_ordem_preventiva)[:6]

    # ── Ocorrências críticas ──
    criticas = await db.scalar(
        select(sa_func.count(Ocorrencia.id)).where(
            Ocorrencia.organization_id == org,
            Ocorrencia.veiculo_id.in_(veiculos_no_escopo),
            Ocorrencia.deleted_at.is_(None),
            Ocorrencia.gravidade.in_(["ALTA", "CRITICA"]),
            Ocorrencia.status.in_(["ABERTA", "EM_ANALISE"]),
        )
    ) or 0

    # ── CNHs vencendo (§10) ──
    motoristas_ativos = (
        await db.execute(
            select(Motorista).where(
                Motorista.organization_id == org,
                sa_false() if restrito else sa_true(),
                Motorista.deleted_at.is_(None),
                Motorista.ativo.is_(True),
                Motorista.cnh_validade.isnot(None),
            )
        )
    ).scalars().all()
    cnh_alertas = {"vencidas": [], "vence_7": [], "vence_30": [], "vence_60": []}
    for m in motoristas_ativos:
        dias = (m.cnh_validade - hoje_date).days
        item = {"id": str(m.id), "nome": m.nome, "validade": m.cnh_validade.isoformat(), "dias_restantes": dias}
        if dias < 0:
            cnh_alertas["vencidas"].append(item)
        elif dias <= 7:
            cnh_alertas["vence_7"].append(item)
        elif dias <= 30:
            cnh_alertas["vence_30"].append(item)
        elif dias <= 60:
            cnh_alertas["vence_60"].append(item)

    # ── Gráficos (§30) ──

    async def consumo_periodo(dias: int):
        inicio = hoje - timedelta(days=dias)
        row = (
            await db.execute(
                select(
                    sa_func.coalesce(sa_func.sum(Abastecimento.quantidade_litros), 0),
                    sa_func.count(Abastecimento.id),
                ).where(
                    Abastecimento.organization_id == org,
                    filtro_escopo(user, Abastecimento.unidade_id),
                    Abastecimento.status == "CONFIRMADO",
                    Abastecimento.data_abastecimento >= inicio,
                )
            )
        ).one()
        return {"litros": float(row[0]), "quantidade": row[1]}

    consumo_7d = await consumo_periodo(7)
    consumo_30d = await consumo_periodo(30)
    consumo_12m = await consumo_periodo(365)

    # Evolução mensal (últimos 6 meses)
    evolucao_mensal = []
    for i in range(5, -1, -1):
        mes_ref = (hoje.replace(day=1) - timedelta(days=30 * i)).replace(day=1)
        mes_seguinte = (mes_ref + timedelta(days=32)).replace(day=1)
        row = (
            await db.execute(
                select(
                    sa_func.coalesce(sa_func.sum(Abastecimento.quantidade_litros), 0),
                    sa_func.coalesce(sa_func.sum(Abastecimento.custo_total), 0),
                    sa_func.count(Abastecimento.id),
                ).where(
                    Abastecimento.organization_id == org,
                    filtro_escopo(user, Abastecimento.unidade_id),
                    Abastecimento.status == "CONFIRMADO",
                    Abastecimento.data_abastecimento >= mes_ref,
                    Abastecimento.data_abastecimento < mes_seguinte,
                )
            )
        ).one()
        evolucao_mensal.append(
            {
                "mes": mes_ref.strftime("%Y-%m"),
                "litros": float(row[0]),
                "gasto": float(row[1]),
                "quantidade": row[2],
            }
        )

    # Ranking por veículo — combustível e custo total (combustível + manutenção)
    ranking_combustivel = (
        await db.execute(
            select(
                Abastecimento.veiculo_id,
                sa_func.sum(Abastecimento.quantidade_litros),
                sa_func.coalesce(sa_func.sum(Abastecimento.custo_total), 0),
                sa_func.avg(Abastecimento.consumo_km_l),
            )
            .where(
                Abastecimento.organization_id == org,
                filtro_escopo(user, Abastecimento.unidade_id),
                Abastecimento.status == "CONFIRMADO",
                Abastecimento.data_abastecimento >= hoje - timedelta(days=90),
            )
            .group_by(Abastecimento.veiculo_id)
            .order_by(sa_func.sum(Abastecimento.quantidade_litros).desc())
            .limit(5)
        )
    ).all()

    ranking_manutencao = (
        await db.execute(
            select(
                Manutencao.veiculo_id,
                sa_func.sum(Manutencao.valor_total),
            )
            .where(
                Manutencao.organization_id == org,
                filtro_escopo(user, Manutencao.unidade_id),
                Manutencao.deleted_at.is_(None),
                Manutencao.data_solicitacao >= (hoje - timedelta(days=90)).date(),
            )
            .group_by(Manutencao.veiculo_id)
            .limit(50)
        )
    ).all()

    manut_por_veiculo = {str(v): float(c or 0) for v, c in ranking_manutencao}

    # Carrega placas/modelos em lote (evita N+1).
    ranking_ids = [row[0] for row in ranking_combustivel]
    if ranking_ids:
        veiculo_ranking_map = {
            v.id: v
            for v in (
                await db.execute(select(Veiculo).where(Veiculo.id.in_(ranking_ids)))
            ).scalars()
        }
    else:
        veiculo_ranking_map = {}

    ranking = []
    for veiculo_id, litros, gasto, consumo_medio in ranking_combustivel:
        placa_modelo = veiculo_ranking_map.get(veiculo_id)
        vid = str(veiculo_id)
        custo_comb = float(gasto or 0)
        custo_manut = manut_por_veiculo.get(vid, 0.0)
        ranking.append(
            {
                "veiculo_id": vid,
                "placa": placa_modelo.placa if placa_modelo else None,
                "modelo": f"{placa_modelo.marca or ''} {placa_modelo.modelo or ''}".strip() if placa_modelo else None,
                "litros": float(litros or 0),
                "custo_combustivel": custo_comb,
                "custo_manutencao": custo_manut,
                "consumo_medio_km_l": round(float(consumo_medio), 2) if consumo_medio else None,
                "custo_total": round(custo_comb + custo_manut, 2),
            }
        )

    # ── Últimos abastecimentos (§29) ──
    ultimos_rows = (
        await db.execute(
            select(Abastecimento)
            .where(
                Abastecimento.organization_id == org,
                filtro_escopo(user, Abastecimento.unidade_id),
                Abastecimento.status == "CONFIRMADO",
                Abastecimento.deleted_at.is_(None),
            )
            .options(
                selectinload(Abastecimento.veiculo),
                selectinload(Abastecimento.motorista),
                selectinload(Abastecimento.combustivel),
            )
            .order_by(Abastecimento.data_abastecimento.desc())
            .limit(5)
        )
    ).scalars().all()
    ultimos_abastecimentos = [
        {
            "id": str(a.id),
            "data": a.data_abastecimento.isoformat(),
            "veiculo_id": str(a.veiculo_id),
            "placa": a.veiculo.placa if a.veiculo else None,
            "modelo": (f"{a.veiculo.marca or ''} {a.veiculo.modelo or ''}".strip() or None) if a.veiculo else None,
            "motorista": a.motorista.nome if a.motorista else None,
            "combustivel": a.combustivel.nome if a.combustivel else None,
            "litros": float(a.quantidade_litros),
            "quilometragem": a.quilometragem,
            "custo_total": float(a.custo_total or 0),
        }
        for a in ultimos_rows
    ]

    # ── Documentos de veículos vencendo (60 dias) ──
    limite_doc = hoje_date + timedelta(days=60)
    docs_rows = (
        await db.execute(
            select(VeiculoDocumento, Veiculo)
            .join(Veiculo, Veiculo.id == VeiculoDocumento.veiculo_id)
            .where(
                VeiculoDocumento.organization_id == org,
                filtro_escopo(user, Veiculo.unidade_id),
                VeiculoDocumento.vencimento.isnot(None),
                VeiculoDocumento.vencimento <= limite_doc,
                Veiculo.deleted_at.is_(None),
            )
            .order_by(VeiculoDocumento.vencimento)
            .limit(5)
        )
    ).all()
    documentos_vencendo = [
        {
            "id": str(d.id),
            "veiculo_id": str(v.id),
            "placa": v.placa,
            "descricao": d.descricao,
            "vencimento": d.vencimento.isoformat(),
            "dias_restantes": (d.vencimento - hoje_date).days,
        }
        for d, v in docs_rows
    ]

    org_nome = await db.scalar(select(Organization.name).where(Organization.id == org)) if org else None

    # ── Abastecimentos a conferir (alertas dos últimos 7 dias) ──
    abastecimentos_com_alerta = await db.scalar(
        select(sa_func.count(Abastecimento.id)).where(
            Abastecimento.organization_id == org,
            filtro_escopo(user, Abastecimento.unidade_id),
            Abastecimento.status == "CONFIRMADO",
            Abastecimento.alertas.isnot(None),
            Abastecimento.data_abastecimento >= hoje - timedelta(days=7),
        )
    ) or 0

    # ── Gasto do mês por secretaria/unidade (combustível) ──
    gasto_unidades_rows = (
        await db.execute(
            select(
                Abastecimento.unidade_id,
                sa_func.coalesce(sa_func.sum(Abastecimento.custo_total), 0),
                sa_func.coalesce(sa_func.sum(Abastecimento.quantidade_litros), 0),
            )
            .where(
                Abastecimento.organization_id == org,
                filtro_escopo(user, Abastecimento.unidade_id),
                Abastecimento.status == "CONFIRMADO",
                Abastecimento.data_abastecimento >= inicio_mes,
            )
            .group_by(Abastecimento.unidade_id)
        )
    ).all()
    nomes_unidades = {
        u.id: u.nome
        for u in (
            await db.execute(select(Unidade).where(Unidade.organization_id == org))
        ).scalars().all()
    }
    gasto_por_unidade = sorted(
        [
            {
                "unidade_id": str(uid) if uid else None,
                "unidade": nomes_unidades.get(uid) or "Sem secretaria definida",
                "gasto": float(gasto),
                "litros": float(litros),
            }
            for uid, gasto, litros in gasto_unidades_rows
        ],
        key=lambda x: -x["gasto"],
    )

    # ── Onboarding: o tenant já está configurado? ──
    total_motoristas = await db.scalar(
        select(sa_func.count(Motorista.id)).where(
            Motorista.organization_id == org, Motorista.deleted_at.is_(None), sa_false() if restrito else sa_true(),
        )
    ) or 0
    total_abastecimentos = await db.scalar(
        select(sa_func.count(Abastecimento.id)).where(
            Abastecimento.organization_id == org, Abastecimento.deleted_at.is_(None), filtro_escopo(user, Abastecimento.unidade_id),
        )
    ) or 0
    total_entradas = await db.scalar(
        select(sa_func.count(EntradaCombustivel.id)).where(
            EntradaCombustivel.organization_id == org,
            EntradaCombustivel.cancelada.is_(False),
        )
    ) or 0
    onboarding = {
        "veiculos": total_veiculos,
        "motoristas": total_motoristas,
        "tanques": len(tanques),
        "abastecimentos": total_abastecimentos,
        "entradas": total_entradas,
        # Só é "organização nova" quando nada foi cadastrado ainda — nunca por
        # ausência de movimento no mês.
        "pendente": not restrito
        and total_veiculos == 0
        and total_motoristas == 0
        and len(tanques) == 0
        and total_abastecimentos == 0,
    }

    return {
        "organizacao": {"id": str(org) if org else None, "nome": org_nome},
        "onboarding": onboarding,
        "atualizado_em": utcnow().isoformat(),
        "ultimos_abastecimentos": ultimos_abastecimentos,
        "proximas_preventivas": proximas_preventivas,
        "documentos_vencendo": documentos_vencendo,
        "frota": {
            "total": total_veiculos,
            "disponiveis": frota_por_situacao.get("DISPONIVEL", 0),
            "em_uso": frota_por_situacao.get("EM_USO", 0),
            "em_manutencao": frota_por_situacao.get("EM_MANUTENCAO", 0),
            "indisponiveis": frota_por_situacao.get("INDISPONIVEL", 0),
            "baixados": frota_por_situacao.get("BAIXADO", 0),
        },
        "tanques": tanques,
        "contratos_posto": contratos_posto,
        "abastecimentos": {
            "hoje_litros": float(stats_hoje[1]),
            "hoje_quantidade": stats_hoje[0],
            "mes_litros": float(stats_mes[1]),
            "mes_gasto": float(stats_mes[2]),
            "mes_quantidade": stats_mes[0],
            "com_alerta_7d": abastecimentos_com_alerta,
        },
        "gasto_por_unidade_mes": gasto_por_unidade,
        "manutencao": {
            "abertas": abertas,
            "veiculos_em_manutencao": frota_por_situacao.get("EM_MANUTENCAO", 0),
            "preventivas_proximas": preventivas_proximas,
            "preventivas_vencidas": preventivas_vencidas,
        },
        "ocorrencias_criticas": criticas,
        "cnh_alertas": cnh_alertas,
        "graficos": {
            "consumo_7d": consumo_7d,
            "consumo_30d": consumo_30d,
            "consumo_12m": consumo_12m,
            "evolucao_mensal": evolucao_mensal,
            "ranking_veiculos": ranking,
        },
    }

