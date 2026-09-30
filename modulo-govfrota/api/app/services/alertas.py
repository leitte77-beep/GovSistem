"""Alertas da frota — situação atual calculada na hora (não persistida).

Alimenta a tela "Alertas" junto com as notificações persistidas (eventos, ex.:
abastecimento que precisa de conferência). Usa as configurações da organização:
- `antecedencia_alerta_manutencao_dias`: janela de aviso de preventivas por data
  e de documentos/CNH a vencer;
- `alerta_estoque_minimo_dias`: avisa quando o estoque do tanque dura menos que
  N dias no ritmo de consumo dos últimos 30 dias.
"""

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.abastecimento import Abastecimento
from app.models.combustivel import Tanque
from app.models.manutencao import PlanoPreventivo
from app.models.motorista import Motorista
from app.models.ocorrencia import Ocorrencia
from app.models.veiculo import Veiculo, VeiculoDocumento

JANELA_CONSUMO_DIAS = 30


def situacao_preventiva(
    plano: PlanoPreventivo, veiculo: Veiculo | None, antecedencia_dias: int = 15
) -> dict:
    """Próxima execução e situação (VENCIDA / PROXIMA / EM_DIA) de um plano.

    Km e horímetro avisam a 10% do intervalo (mínimo 500 km / 10 h); datas
    avisam com a antecedência configurada pela organização.
    """
    r = {
        "proxima_km": None,
        "proxima_horimetro": None,
        "proxima_data": None,
        "restante_km": None,
        "restante_horas": None,
        "restante_dias": None,
        "situacao": None,
    }
    if veiculo is None:
        return r
    if plano.base == "QUILOMETRAGEM" and plano.intervalo_km:
        r["proxima_km"] = (plano.ultima_execucao_km or 0) + plano.intervalo_km
        restante = r["proxima_km"] - veiculo.quilometragem_atual
        r["restante_km"] = int(restante)
        limite = max(int(plano.intervalo_km * 0.1), 500)
        r["situacao"] = "VENCIDA" if restante <= 0 else "PROXIMA" if restante <= limite else "EM_DIA"
    elif plano.base == "HORIMETRO" and plano.intervalo_horimetro:
        base = Decimal(plano.ultima_execucao_horimetro or 0)
        r["proxima_horimetro"] = base + Decimal(plano.intervalo_horimetro)
        restante = r["proxima_horimetro"] - Decimal(veiculo.horimetro_atual or 0)
        r["restante_horas"] = float(restante)
        limite = max(Decimal(plano.intervalo_horimetro) * Decimal("0.1"), Decimal("10"))
        r["situacao"] = "VENCIDA" if restante <= 0 else "PROXIMA" if restante <= limite else "EM_DIA"
    elif plano.base in ("DATA", "MESES") and plano.intervalo_meses:
        base_data = plano.ultima_execucao_data or (
            plano.created_at.date() if plano.created_at else date.today()
        )
        r["proxima_data"] = base_data + timedelta(days=30 * plano.intervalo_meses)
        dias = (r["proxima_data"] - date.today()).days
        r["restante_dias"] = dias
        r["situacao"] = "VENCIDA" if dias <= 0 else "PROXIMA" if dias <= antecedencia_dias else "EM_DIA"
    return r


async def autonomia_tanques(db: AsyncSession, organization_id: uuid.UUID) -> dict[uuid.UUID, float | None]:
    """Dias de estoque restantes por tanque, no ritmo dos últimos 30 dias."""
    inicio = datetime.now(timezone.utc) - timedelta(days=JANELA_CONSUMO_DIAS)
    saidas = dict(
        (
            await db.execute(
                select(Abastecimento.tanque_id, sa_func.sum(Abastecimento.quantidade_litros))
                .where(
                    Abastecimento.organization_id == organization_id,
                    Abastecimento.status == "CONFIRMADO",
                    Abastecimento.tanque_id.isnot(None),
                    Abastecimento.data_abastecimento >= inicio,
                )
                .group_by(Abastecimento.tanque_id)
            )
        ).all()
    )
    tanques = (
        await db.execute(
            select(Tanque).where(
                Tanque.organization_id == organization_id,
                Tanque.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    resultado: dict[uuid.UUID, float | None] = {}
    for t in tanques:
        por_dia = float(saidas.get(t.id) or 0) / JANELA_CONSUMO_DIAS
        resultado[t.id] = round(float(t.estoque_atual) / por_dia, 1) if por_dia > 0 else None
    return resultado


def _alerta(tipo: str, severidade: str, titulo: str, descricao: str | None, link: str | None) -> dict:
    return {
        "tipo": tipo,
        "severidade": severidade,
        "titulo": titulo,
        "descricao": descricao,
        "link": link,
    }


async def alertas_atuais(db: AsyncSession, organization_id: uuid.UUID) -> list[dict]:
    """Pendências da frota agora, da mais grave para a menos grave."""
    from app.services.abastecimento import ALERTAS, alertas_do_registro, get_configuracoes

    config = await get_configuracoes(db, organization_id)
    antecedencia = config.antecedencia_alerta_manutencao_dias
    hoje = date.today()
    itens: list[dict] = []

    # Ocorrências graves em aberto
    ocorrencias = (
        await db.execute(
            select(Ocorrencia, Veiculo.placa)
            .join(Veiculo, Veiculo.id == Ocorrencia.veiculo_id)
            .where(
                Ocorrencia.organization_id == organization_id,
                Ocorrencia.deleted_at.is_(None),
                Ocorrencia.gravidade.in_(["ALTA", "CRITICA"]),
                Ocorrencia.status.in_(["ABERTA", "EM_ANALISE"]),
            )
        )
    ).all()
    for o, placa in ocorrencias:
        itens.append(_alerta(
            "OCORRENCIA", "CRITICO" if o.gravidade == "CRITICA" else "ALERTA",
            f"Ocorrência {o.gravidade.lower()} — {placa}", o.descricao[:160], f"/ocorrencias/{o.id}",
        ))

    # CNH vencida ou vencendo
    motoristas = (
        await db.execute(
            select(Motorista).where(
                Motorista.organization_id == organization_id,
                Motorista.deleted_at.is_(None),
                Motorista.ativo.is_(True),
                Motorista.cnh_validade.isnot(None),
                Motorista.cnh_validade <= hoje + timedelta(days=max(antecedencia, 30)),
            )
        )
    ).scalars().all()
    for m in motoristas:
        dias = (m.cnh_validade - hoje).days
        if dias < 0:
            itens.append(_alerta("CNH", "CRITICO", f"CNH vencida — {m.nome}",
                                 f"Venceu há {-dias} dia(s).", f"/motoristas/{m.id}"))
        else:
            itens.append(_alerta("CNH", "ALERTA", f"CNH vence em {dias} dia(s) — {m.nome}",
                                 None, f"/motoristas/{m.id}"))

    # Estoque: abaixo do mínimo ou com poucos dias de autonomia
    autonomia = await autonomia_tanques(db, organization_id)
    tanques = (
        await db.execute(
            select(Tanque).where(
                Tanque.organization_id == organization_id,
                Tanque.deleted_at.is_(None),
                Tanque.ativo.is_(True),
            )
        )
    ).scalars().all()
    for t in tanques:
        dias = autonomia.get(t.id)
        if t.estoque_minimo and t.estoque_atual <= t.estoque_minimo:
            itens.append(_alerta("ESTOQUE", "CRITICO", f"Estoque abaixo do mínimo — {t.nome}",
                                 f"{float(t.estoque_atual):.0f} L (mínimo {float(t.estoque_minimo):.0f} L).",
                                 f"/tanques/{t.id}"))
        elif dias is not None and config.alerta_estoque_minimo_dias and dias < config.alerta_estoque_minimo_dias:
            itens.append(_alerta("ESTOQUE", "ALERTA", f"Estoque para ~{dias:.0f} dia(s) — {t.nome}",
                                 f"No ritmo dos últimos {JANELA_CONSUMO_DIAS} dias o tanque esvazia antes de "
                                 f"{config.alerta_estoque_minimo_dias} dias. Programe a compra.",
                                 f"/tanques/{t.id}"))

    # Preventivas vencidas ou próximas
    planos = (
        await db.execute(
            select(PlanoPreventivo).where(
                PlanoPreventivo.organization_id == organization_id,
                PlanoPreventivo.deleted_at.is_(None),
                PlanoPreventivo.ativo.is_(True),
            )
        )
    ).scalars().all()
    if planos:
        veiculos = {
            v.id: v
            for v in (
                await db.execute(select(Veiculo).where(
                    Veiculo.id.in_({p.veiculo_id for p in planos}),
                    Veiculo.deleted_at.is_(None),
                ))
            ).scalars()
        }
        for p in planos:
            v = veiculos.get(p.veiculo_id)
            r = situacao_preventiva(p, v, antecedencia)
            if r["situacao"] not in ("VENCIDA", "PROXIMA"):
                continue
            if r["restante_km"] is not None:
                falta = f"{abs(r['restante_km']):,} km".replace(",", ".")
            elif r["restante_horas"] is not None:
                falta = f"{abs(r['restante_horas']):.0f} h"
            else:
                falta = f"{abs(r['restante_dias'])} dia(s)"
            desc = f"Venceu há {falta}." if r["situacao"] == "VENCIDA" else f"Faltam {falta}."
            itens.append(_alerta(
                "PREVENTIVA", "ALERTA" if r["situacao"] == "VENCIDA" else "INFO",
                f"{p.nome} — {v.placa}", desc, f"/veiculos/{v.id}",
            ))

    # Documentos (CRLV, seguro etc.) vencidos ou a vencer
    docs = (
        await db.execute(
            select(VeiculoDocumento, Veiculo)
            .join(Veiculo, Veiculo.id == VeiculoDocumento.veiculo_id)
            .where(
                VeiculoDocumento.organization_id == organization_id,
                VeiculoDocumento.vencimento.isnot(None),
                VeiculoDocumento.vencimento <= hoje + timedelta(days=antecedencia),
                Veiculo.deleted_at.is_(None),
            )
        )
    ).all()
    for d, v in docs:
        dias = (d.vencimento - hoje).days
        itens.append(_alerta(
            "DOCUMENTO", "ALERTA" if dias < 0 else "INFO",
            f"{d.descricao} — {v.placa}",
            f"Vencido há {-dias} dia(s)." if dias < 0 else f"Vence em {dias} dia(s).",
            f"/veiculos/{v.id}",
        ))

    # Abastecimentos dos últimos 7 dias com alerta de conferência
    recentes = (
        await db.execute(
            select(Abastecimento, Veiculo.placa)
            .join(Veiculo, Veiculo.id == Abastecimento.veiculo_id)
            .where(
                Abastecimento.organization_id == organization_id,
                Abastecimento.status == "CONFIRMADO",
                Abastecimento.alertas.isnot(None),
                Abastecimento.data_abastecimento >= datetime.now(timezone.utc) - timedelta(days=7),
            )
            .order_by(Abastecimento.data_abastecimento.desc())
            .limit(50)
        )
    ).all()
    for a, placa in recentes:
        codigos = alertas_do_registro(a)
        if codigos:
            itens.append(_alerta(
                "ABASTECIMENTO", "ALERTA", f"Conferir abastecimento — {placa}",
                "; ".join(ALERTAS.get(c, c) for c in codigos), f"/abastecimentos/{a.id}",
            ))

    ordem = {"CRITICO": 0, "ALERTA": 1, "INFO": 2}
    itens.sort(key=lambda x: ordem.get(x["severidade"], 3))
    return itens
