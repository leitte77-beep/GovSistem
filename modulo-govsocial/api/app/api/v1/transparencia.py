"""
Portal de Transparência — dados anonimizados e agregados da assistência social.
Rotas públicas, sem autenticação.
"""

import calendar
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.beneficio import ConcessaoBeneficio
from app.models.domain import BenefitType
from app.models.family import Family
from app.models.organization import Organization
from app.models.unit import Unit
from app.models.attendance import Attendance

router = APIRouter(tags=["Transparência"], prefix="/transparencia")


async def _resolve_tenant(db: AsyncSession, tenant_slug: str) -> Organization:
    org = (
        await db.execute(
            select(Organization).where(
                Organization.slug == tenant_slug,
                Organization.is_active.is_(True),
                Organization.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Município não encontrado")
    return org


@router.get("/{tenant_slug}/dashboard")
async def dashboard(
    tenant_slug: str,
    db: AsyncSession = Depends(get_db),
):
    org = await _resolve_tenant(db, tenant_slug)
    tenant_id = org.id

    # ── KPI cards ──────────────────────────────────────────────────────
    fam_count = (
        await db.execute(
            select(func.count(Family.id)).where(
                Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    now = datetime.now(timezone.utc)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    atend_mes = (
        await db.execute(
            select(func.count(Attendance.id)).where(
                Attendance.tenant_id == tenant_id,
                Attendance.deleted_at.is_(None),
                Attendance.data_atendimento >= start_of_month,
            )
        )
    ).scalar() or 0

    benef_entregues = (
        await db.execute(
            select(func.count(ConcessaoBeneficio.id)).where(
                ConcessaoBeneficio.tenant_id == tenant_id,
                ConcessaoBeneficio.status == "ENTREGUE",
            )
        )
    ).scalar() or 0

    # ── Distribuição por território ────────────────────────────────────
    territorio_rows = (
        await db.execute(
            select(
                func.coalesce(Family.territorio, "Não informado").label("label"),
                func.count(Family.id).label("cnt"),
            )
            .where(
                Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
            )
            .group_by(text("label"))
            .order_by(text("cnt DESC"))
            .limit(20)
        )
    ).all()

    distribuicao_territorio = [{"bairro": row.label, "contagem": row.cnt} for row in territorio_rows]

    # ── Distribuição por tipo de benefício ─────────────────────────────
    beneficio_rows = (
        await db.execute(
            select(
                ConcessaoBeneficio.benefit_type_code,
                func.count(ConcessaoBeneficio.id).label("cnt"),
            )
            .where(
                ConcessaoBeneficio.tenant_id == tenant_id,
                ConcessaoBeneficio.status.in_(["ENTREGUE"]),
            )
            .group_by(ConcessaoBeneficio.benefit_type_code)
            .order_by(text("cnt DESC"))
        )
    ).all()

    # Resolve nome dos tipos de benefício
    bt_codes = [r.benefit_type_code for r in beneficio_rows]
    bt_names: dict[str, str] = {}
    if bt_codes:
        bt_result = (
            await db.execute(
                select(BenefitType.code, BenefitType.nome).where(
                    BenefitType.tenant_id == tenant_id,
                    BenefitType.code.in_(bt_codes),
                    BenefitType.ativo.is_(True),
                )
            )
        ).all()
        bt_names = {r.code: r.nome for r in bt_result}

    distribuicao_beneficios = [
        {
            "tipo": bt_names.get(r.benefit_type_code, r.benefit_type_code),
            "codigo": r.benefit_type_code,
            "contagem": r.cnt,
        }
        for r in beneficio_rows
    ]

    # ── Evolução mensal (últimos 12 meses) ─────────────────────────────
    doze_meses_atras = start_of_month - timedelta(days=365)
    evolucao_rows = (
        await db.execute(
            select(
                func.date_trunc("month", Attendance.data_atendimento).label("mes"),
                func.count(Attendance.id).label("cnt"),
            )
            .where(
                Attendance.tenant_id == tenant_id,
                Attendance.deleted_at.is_(None),
                Attendance.data_atendimento >= doze_meses_atras,
            )
            .group_by(text("mes"))
            .order_by(text("mes"))
        )
    ).all()

    evolucao_mensal = [
        {
            "ano": row.mes.year,
            "mes": row.mes.month,
            "mes_nome": calendar.month_abbr[row.mes.month],
            "contagem": row.cnt,
        }
        for row in evolucao_rows
    ]

    # ── Unidades ativas ────────────────────────────────────────────────
    unidades_rows = (
        await db.execute(
            select(Unit).where(
                Unit.tenant_id == tenant_id,
                Unit.deleted_at.is_(None),
                Unit.is_active.is_(True),
            ).order_by(Unit.nome)
        )
    ).scalars().all()

    unidades_ativas = [
        {
            "id": str(u.id),
            "nome": u.nome,
            "tipo": u.tipo,
            "endereco": f"{u.logradouro or ''}, {u.numero or ''} - {u.bairro or ''}, {u.municipio or ''} - {u.uf or ''}".strip(", -"),
            "telefone": u.telefone,
            "email": u.email,
        }
        for u in unidades_rows
    ]

    return {
        "municipio": org.name,
        "slug": org.slug,
        "total_familias_cadastradas": fam_count,
        "total_atendimentos_mes": atend_mes,
        "total_beneficios_entregues": benef_entregues,
        "distribuicao_por_territorio": distribuicao_territorio,
        "distribuicao_por_tipo_beneficio": distribuicao_beneficios,
        "evolucao_mensal_atendimentos": evolucao_mensal,
        "unidades_ativas": unidades_ativas,
    }


@router.get("/{tenant_slug}/beneficios")
async def beneficios_agregados(
    tenant_slug: str,
    db: AsyncSession = Depends(get_db),
):
    org = await _resolve_tenant(db, tenant_slug)
    tenant_id = org.id

    rows = (
        await db.execute(
            select(
                ConcessaoBeneficio.benefit_type_code,
                ConcessaoBeneficio.status,
                func.count(ConcessaoBeneficio.id).label("cnt"),
            )
            .where(ConcessaoBeneficio.tenant_id == tenant_id)
            .group_by(
                ConcessaoBeneficio.benefit_type_code,
                ConcessaoBeneficio.status,
            )
            .order_by(ConcessaoBeneficio.benefit_type_code, ConcessaoBeneficio.status)
        )
    ).all()

    bt_codes = list({r.benefit_type_code for r in rows})
    bt_names: dict[str, str] = {}
    if bt_codes:
        bt_result = (
            await db.execute(
                select(BenefitType.code, BenefitType.nome).where(
                    BenefitType.tenant_id == tenant_id,
                    BenefitType.code.in_(bt_codes),
                    BenefitType.ativo.is_(True),
                )
            )
        ).all()
        bt_names = {r.code: r.nome for r in bt_result}

    resultado: dict[str, dict] = {}
    for r in rows:
        nome = bt_names.get(r.benefit_type_code, r.benefit_type_code)
        if r.benefit_type_code not in resultado:
            resultado[r.benefit_type_code] = {
                "tipo": nome,
                "codigo": r.benefit_type_code,
                "total": 0,
                "por_status": {},
            }
        resultado[r.benefit_type_code]["por_status"][r.status] = r.cnt
        resultado[r.benefit_type_code]["total"] += r.cnt

    return list(resultado.values())


@router.get("/{tenant_slug}/unidades")
async def unidades(
    tenant_slug: str,
    db: AsyncSession = Depends(get_db),
):
    org = await _resolve_tenant(db, tenant_slug)
    tenant_id = org.id

    unidades_rows = (
        await db.execute(
            select(Unit).where(
                Unit.tenant_id == tenant_id,
                Unit.deleted_at.is_(None),
                Unit.is_active.is_(True),
            ).order_by(Unit.nome)
        )
    ).scalars().all()

    return [
        {
            "id": str(u.id),
            "nome": u.nome,
            "tipo": u.tipo,
            "endereco": f"{u.logradouro or ''}, {u.numero or ''} - {u.bairro or ''}, {u.municipio or ''} - {u.uf or ''}".strip(", -"),
            "telefone": u.telefone,
            "email": u.email,
        }
        for u in unidades_rows
    ]
