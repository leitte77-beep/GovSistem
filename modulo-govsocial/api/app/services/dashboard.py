import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.acao_coletiva import AcaoColetiva, Inscricao
from app.models.acompanhamento import Acompanhamento
from app.models.attendance import Attendance
from app.models.beneficio import ConcessaoBeneficio
from app.models.encaminhamento import Encaminhamento
from app.models.family import Family


def _dt(d: date) -> datetime:
    return datetime(d.year, d.month, 1, tzinfo=timezone.utc)


async def get_overview(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    """KPIs para o dashboard do gestor."""
    hoje = date.today()
    inicio_mes = date(hoje.year, hoje.month, 1)

    atendimentos_mes = (
        await db.execute(
            select(func.count(Attendance.id)).where(
                Attendance.tenant_id == tenant_id,
                Attendance.data_atendimento >= _dt(inicio_mes),
                Attendance.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    acs_ativos = (
        await db.execute(
            select(func.count(Acompanhamento.id)).where(
                Acompanhamento.tenant_id == tenant_id,
                Acompanhamento.situacao == "ATIVO",
                Acompanhamento.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    familias_cadastradas = (
        await db.execute(
            select(func.count(Family.id)).where(
                Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    beneficios_mes = (
        await db.execute(
            select(func.count(ConcessaoBeneficio.id)).where(
                ConcessaoBeneficio.tenant_id == tenant_id,
                ConcessaoBeneficio.data_solicitacao >= _dt(inicio_mes),
            )
        )
    ).scalar() or 0

    enc_pendentes = (
        await db.execute(
            select(func.count(Encaminhamento.id)).where(
                Encaminhamento.tenant_id == tenant_id,
                Encaminhamento.status == "PENDENTE",
                Encaminhamento.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    grupos_ativos = (
        await db.execute(
            select(func.count(AcaoColetiva.id)).where(
                AcaoColetiva.tenant_id == tenant_id,
                AcaoColetiva.status == "ATIVA",
                AcaoColetiva.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    inscricoes_scfv = (
        await db.execute(
            select(func.count(Inscricao.id)).where(
                Inscricao.tenant_id == tenant_id,
                Inscricao.status == "ATIVA",
            )
        )
    ).scalar() or 0

    return {
        "atendimentos_mes": int(atendimentos_mes),
        "acompanhamentos_ativos": int(acs_ativos),
        "familias_cadastradas": int(familias_cadastradas),
        "beneficios_concedidos_mes": int(beneficios_mes),
        "encaminhamentos_pendentes": int(enc_pendentes),
        "grupos_ativos": int(grupos_ativos),
        "inscritos_scfv": int(inscricoes_scfv),
    }


async def get_time_series(db: AsyncSession, tenant_id: uuid.UUID, meses: int = 12) -> list:
    """Série histórica de atendimentos por mês."""
    hoje = date.today()
    resultados = []
    for i in range(meses):
        ano = hoje.year if hoje.month - i > 0 else hoje.year - 1
        mes = hoje.month - i if hoje.month - i > 0 else 12 + (hoje.month - i)
        inicio = date(ano, mes, 1)
        if mes == 12:
            fim = date(ano + 1, 1, 1)
        else:
            fim = date(ano, mes + 1, 1)

        total = (
            await db.execute(
                select(func.count(Attendance.id)).where(
                    Attendance.tenant_id == tenant_id,
                    Attendance.data_atendimento >= _dt(inicio),
                    Attendance.data_atendimento < _dt(fim),
                    Attendance.deleted_at.is_(None),
                )
            )
        ).scalar() or 0

        beneficios = (
            await db.execute(
                select(func.count(ConcessaoBeneficio.id)).where(
                    ConcessaoBeneficio.tenant_id == tenant_id,
                    ConcessaoBeneficio.data_solicitacao >= _dt(inicio),
                    ConcessaoBeneficio.data_solicitacao < _dt(fim),
                )
            )
        ).scalar() or 0

        resultados.append({
            "ano": ano,
            "mes": mes,
            "atendimentos": int(total),
            "beneficios": int(beneficios),
        })
    resultados.reverse()
    return resultados


async def get_by_territory(db: AsyncSession, tenant_id: uuid.UUID) -> list:
    """Agregados por território/bairro (anônimos)."""
    rows = (
        await db.execute(
            select(
                Family.territorio,
                func.count(Family.id).label("total_familias"),
            ).where(
                Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
            ).group_by(Family.territorio).order_by(func.count(Family.id).desc())
        )
    ).all()

    return [
        {
            "territorio": r.territorio or "Sem território",
            "total_familias": r.total_familias,
        }
        for r in rows
    ]


async def get_map_data(db: AsyncSession, tenant_id: uuid.UUID) -> list:
    """Dados agregados para mapa de calor por território.
    Nunca expõe coordenadas individuais — apenas agregados por bairro.
    """
    rows = (
        await db.execute(
            select(
                Family.territorio,
                Family.bairro,
                func.count(Family.id).label("total"),
                func.avg(Family.latitude).label("lat_media"),
                func.avg(Family.longitude).label("lng_media"),
            ).where(
                Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
                Family.latitude.isnot(None),
            ).group_by(Family.territorio, Family.bairro)
        )
    ).all()

    return [
        {
            "territorio": r.territorio or "Não definido",
            "bairro": r.bairro or "Não informado",
            "total_familias": r.total,
            "centroide_lat": float(r.lat_media) if r.lat_media else None,
            "centroide_lng": float(r.lng_media) if r.lng_media else None,
        }
        for r in rows
    ]


async def get_benefits_report(
    db: AsyncSession, tenant_id: uuid.UUID, ano: int | None = None, mes: int | None = None,
) -> list:
    """Relatório de consumo de benefícios por tipo."""
    q = (
        select(
            ConcessaoBeneficio.benefit_type_code,
            func.count(ConcessaoBeneficio.id).label("total"),
            func.sum(ConcessaoBeneficio.valor_total).label("valor_total"),
        ).where(
            ConcessaoBeneficio.tenant_id == tenant_id,
            ConcessaoBeneficio.status.in_(["ENTREGUE", "APROVADO"]),
        )
    )
    if ano and mes:
        inicio = date(ano, mes, 1)
        if mes == 12:
            fim = date(ano + 1, 1, 1)
        else:
            fim = date(ano, mes + 1, 1)
        q = q.where(
            ConcessaoBeneficio.data_solicitacao >= _dt(inicio),
            ConcessaoBeneficio.data_solicitacao < _dt(fim),
        )
    q = (
        q.group_by(ConcessaoBeneficio.benefit_type_code)
        .order_by(func.count(ConcessaoBeneficio.id).desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {"tipo_beneficio": r.benefit_type_code, "total_concessoes": int(r.total),
         "valor_total": float(r.valor_total) if r.valor_total else 0}
        for r in rows
    ]


async def get_indicators(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    """Indicadores socioassistenciais derivados do cadastro."""
    total = (
        await db.execute(
            select(func.count(Family.id)).where(
                Family.tenant_id == tenant_id, Family.deleted_at.is_(None),
            )
        )
    ).scalar() or 1

    pbf = (
        await db.execute(
            select(func.count(Family.id)).where(
                Family.tenant_id == tenant_id,
                Family.beneficiaria_pbf.is_(True),
                Family.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    bpc = (
        await db.execute(
            select(func.count(Family.id)).where(
                Family.tenant_id == tenant_id,
                Family.possui_bpc.is_(True),
                Family.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    cadunico_desatualizado = (
        await db.execute(
            select(func.count(Family.id)).where(
                Family.tenant_id == tenant_id,
                Family.cadunico_atualizado_em.isnot(None),
                Family.cadunico_atualizado_em < date.today() - timedelta(days=730),
                Family.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    inseguranca = (
        await db.execute(
            select(func.count(Family.id)).where(
                Family.tenant_id == tenant_id,
                Family.inseguranca_alimentar.is_(True),
                Family.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    faixas = (
        await db.execute(
            select(Family.faixa_renda, func.count(Family.id)).where(
                Family.tenant_id == tenant_id, Family.deleted_at.is_(None),
            ).group_by(Family.faixa_renda)
        )
    ).all()

    renda_por_faixa = []
    for row in faixas:
        f = row[0] if row[0] else "NAO_INFORMADO"
        renda_por_faixa.append({"faixa": f, "total": int(row[1])})

    return {
        "total_familias": int(total),
        "pbf": int(pbf),
        "pbf_percentual": round(pbf / total * 100, 1),
        "bpc": int(bpc),
        "bpc_percentual": round(bpc / total * 100, 1),
        "cadunico_desatualizado_24m": int(cadunico_desatualizado),
        "inseguranca_alimentar": int(inseguranca),
        "renda_por_faixa": renda_por_faixa,
    }
