"""API de alertas: acompanhamento sem evolução, plano sem avaliação, medida vencendo."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.acompanhamento import Acompanhamento
from app.models.attendance import Attendance
from app.models.enums import RoleName
from app.models.pia import Pia
from app.models.plano_acompanhamento import PlanoAcompanhamento
from app.models.user import User
from app.schemas.acompanhamento import AlertaOut

router = APIRouter(tags=["alertas"])

_READ = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)


@router.get("/alerts", response_model=list[AlertaOut])
async def listar_alertas(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    alertas: list[AlertaOut] = []
    hoje = date.today()

    # 1. Acompanhamentos ativos sem evolução há > 30 dias
    acs = (
        await db.execute(
            select(Acompanhamento).where(
                Acompanhamento.tenant_id == tenant_id,
                Acompanhamento.situacao == "ATIVO",
                Acompanhamento.deleted_at.is_(None),
            )
        )
    ).scalars().all()

    for ac in acs:
        ultima_att = (
            await db.execute(
                select(func.max(Attendance.data_atendimento)).where(
                    Attendance.tenant_id == tenant_id,
                    Attendance.case_file_id == ac.case_file_id,
                    Attendance.deleted_at.is_(None),
                )
            )
        ).scalar()
        ult = ultima_att.date() if ultima_att else ac.data_inicio
        atraso_dias = (hoje - ult).days
        if atraso_dias > 30:
            alertas.append(AlertaOut(
                tipo="ACOMPANHAMENTO_SEM_EVOLUCAO",
                mensagem=f"Acompanhamento {ac.tipo} sem evolução há {atraso_dias} dias",
                referencia_id=ac.id,
                referencia_tipo="acompanhamento",
                data_referencia=ult,
                dias_em_atraso=atraso_dias - 30,
            ))

    # 2. Planos com data_proxima_avaliacao vencida
    planos_vencidos = (
        await db.execute(
            select(PlanoAcompanhamento).where(
                PlanoAcompanhamento.tenant_id == tenant_id,
                PlanoAcompanhamento.data_proxima_avaliacao.isnot(None),
                PlanoAcompanhamento.data_proxima_avaliacao < hoje,
            ).order_by(PlanoAcompanhamento.data_proxima_avaliacao)
        )
    ).scalars().all()
    for p in planos_vencidos:
        ac_ativo = (
            await db.execute(
                select(Acompanhamento.id).where(
                    Acompanhamento.id == p.acompanhamento_id,
                    Acompanhamento.situacao == "ATIVO",
                    Acompanhamento.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if not ac_ativo:
            continue
        atraso = (hoje - p.data_proxima_avaliacao).days
        alertas.append(AlertaOut(
            tipo="PLANO_SEM_AVALIACAO",
            mensagem=f"Plano com avaliação pendente há {atraso} dias",
            referencia_id=p.id,
            referencia_tipo="plano_acompanhamento",
            data_referencia=p.data_proxima_avaliacao,
            dias_em_atraso=atraso,
        ))

    # 3. Medidas socioeducativas vencendo/vencidas + relatório judiciário pendente
    pias = (
        await db.execute(
            select(Pia).where(Pia.tenant_id == tenant_id)
        )
    ).scalars().all()
    for pia in pias:
        if pia.data_fim_medida:
            dias_fim = (pia.data_fim_medida - hoje).days
            if 0 <= dias_fim <= 30:
                alertas.append(AlertaOut(
                    tipo="MEDIDA_VENCENDO",
                    mensagem=f"Medida {pia.medida_socioeducativa} vence em {dias_fim} dias",
                    referencia_id=pia.id,
                    referencia_tipo="pia",
                    data_referencia=pia.data_fim_medida,
                    dias_em_atraso=0,
                ))
            elif dias_fim < 0:
                alertas.append(AlertaOut(
                    tipo="MEDIDA_VENCIDA",
                    mensagem=f"Medida {pia.medida_socioeducativa} vencida há {abs(dias_fim)} dias",
                    referencia_id=pia.id,
                    referencia_tipo="pia",
                    data_referencia=pia.data_fim_medida,
                    dias_em_atraso=abs(dias_fim),
                ))
        if pia.proximo_relatorio_judiciario and pia.proximo_relatorio_judiciario <= hoje:
            atraso = (hoje - pia.proximo_relatorio_judiciario).days
            alertas.append(AlertaOut(
                tipo="RELATORIO_JUDICIARIO_PENDENTE",
                mensagem=f"Relatório judiciário pendente há {atraso} dias",
                referencia_id=pia.id,
                referencia_tipo="pia",
                data_referencia=pia.proximo_relatorio_judiciario,
                dias_em_atraso=atraso,
            ))

    return alertas
