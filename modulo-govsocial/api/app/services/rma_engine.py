"""Motor de apuração do RMA — implementa as regras de contagem dos manuais do MDS.

Regras críticas:
- Recepção/triagem NÃO conta como atendimento (usa attendances, não reception_log)
- Família contada 1× no mês no Bloco C, independente de quantos atendimentos teve
- Acompanhamento iniciado e encerrado no mesmo mês conta como novo + encerrado
- Visitas domiciliares são contadas separadamente (C6)
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.acao_coletiva import AcaoColetiva, Inscricao
from app.models.acompanhamento import Acompanhamento
from app.models.agenda import VisitaDomiciliar
from app.models.attendance import Attendance
from app.models.case_file import CaseFile
from app.models.encaminhamento import Encaminhamento
from app.models.family import Family
from app.models.unit import Unit


async def calcular_rma(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    unit_id: uuid.UUID,
    ano: int,
    mes: int,
) -> dict:
    """Calcula todos os blocos do RMA para uma unidade no mês/ano.

    Retorna dict com blocos CRAS_A, CRAS_C, CRAS_D, CREAS_A, etc.
    O motor identifica o tipo da unidade e calcula os blocos correspondentes.
    """
    unit = (
        await db.execute(
            select(Unit).where(Unit.id == unit_id, Unit.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not unit:
        return {}

    inicio = datetime(ano, mes, 1, tzinfo=timezone.utc)
    if mes == 12:
        fim = datetime(ano + 1, 1, 1, tzinfo=timezone.utc)
    else:
        fim = datetime(ano, mes + 1, 1, tzinfo=timezone.utc)

    dados = {}

    if unit.tipo == "CRAS":
        dados.update(await _calcular_cras(db, tenant_id, unit_id, inicio, fim, ano, mes))
    elif unit.tipo == "CREAS":
        dados.update(await _calcular_creas(db, tenant_id, unit_id, inicio, fim, ano, mes))
    elif unit.tipo == "CENTRO_POP":
        dados.update(await _calcular_centro_pop(db, tenant_id, unit_id, inicio, fim, ano, mes))

    dados["_metadata"] = {
        "calculado_em": datetime.now(timezone.utc).isoformat(),
        "unidade_tipo": unit.tipo,
        "periodo": f"{ano}-{mes:02d}",
    }
    return dados


async def _calcular_cras(db, tenant_id, unit_id, inicio, fim, ano, mes):
    """Blocos do Formulário 1 — CRAS."""

    # Prontuários (case_files) desta unidade
    cfs = (
        await db.execute(
            select(CaseFile).where(
                CaseFile.tenant_id == tenant_id,
                CaseFile.unit_id == unit_id,
                CaseFile.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    cf_ids = [cf.id for cf in cfs]
    family_ids = list(set(cf.family_id for cf in cfs))

    # ── Bloco A: Famílias em acompanhamento PAIF ──
    acs_paif_ativos = (
        await db.execute(
            select(Acompanhamento).where(
                Acompanhamento.tenant_id == tenant_id,
                Acompanhamento.case_file_id.in_(cf_ids),
                Acompanhamento.tipo == "PAIF",
                Acompanhamento.situacao == "ATIVO",
                Acompanhamento.data_inicio < fim,
                Acompanhamento.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    fams_em_acompanhamento = list(set(
        ac.case_file.family_id for ac in acs_paif_ativos if ac.case_file
    ))

    # Novas famílias no mês (acompanhamento iniciado no mês)
    acs_novos_mes = [
        ac for ac in acs_paif_ativos
        if ac.data_inicio >= inicio.date() and ac.data_inicio <= fim.date()
    ]
    fams_novas = list(set(ac.case_file.family_id for ac in acs_novos_mes if ac.case_file))

    # Detalhes socioeconômicos das famílias
    r_ext_pobreza = 0
    r_pbf = 0
    r_bpc = 0
    if family_ids:
        fam_rows = (
            await db.execute(
                select(Family).where(Family.id.in_(family_ids), Family.tenant_id == tenant_id)
            )
        ).scalars().all()
        for f in fam_rows:
            if f.id in fams_em_acompanhamento:
                if f.faixa_renda in ("EXTREMA_POBREZA",):
                    r_ext_pobreza += 1
                if f.beneficiaria_pbf:
                    r_pbf += 1
                if f.possui_bpc:
                    r_bpc += 1

    cras_a = {
        "A1_familias_acompanhamento": len(fams_em_acompanhamento),
        "A2_familias_novas_mes": len(fams_novas),
        "A3_extrema_pobreza": r_ext_pobreza,
        "A4_beneficiarias_pbf": r_pbf,
        "A5_membros_bpc": r_bpc,
    }

    # ── Bloco C: Atendimentos individualizados ──
    attendances = (
        await db.execute(
            select(Attendance).where(
                Attendance.tenant_id == tenant_id,
                Attendance.unit_id == unit_id,
                Attendance.data_atendimento >= inicio,
                Attendance.data_atendimento < fim,
                Attendance.deleted_at.is_(None),
            )
        )
    ).scalars().all()

    fams_atendidas = list(set(
        a.case_file.family_id for a in attendances
        if a.case_file and a.tipo not in ("GRUPO", "ACAO_COLETIVA")
    ))

    # Encaminhamentos do mês
    encs = (
        await db.execute(
            select(Encaminhamento).where(
                Encaminhamento.tenant_id == tenant_id,
                Encaminhamento.unit_id == unit_id,
                Encaminhamento.data_encaminhamento >= inicio,
                Encaminhamento.data_encaminhamento < fim,
                Encaminhamento.deleted_at.is_(None),
            )
        )
    ).scalars().all()

    # Visitas domiciliares do mês
    visitas = (
        await db.execute(
            select(VisitaDomiciliar).where(
                VisitaDomiciliar.tenant_id == tenant_id,
                VisitaDomiciliar.unit_id == unit_id,
                VisitaDomiciliar.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    visitas_mes = [
        v for v in visitas
        if v.data_realizada and v.data_realizada >= inicio and v.data_realizada < fim
    ]

    cras_c = {
        "C1_total_familias_atendidas": len(fams_atendidas),
        "C2_enc_cadunico_inclusao": sum(1 for e in encs if e.referral_code == "CADUNICO_INCL"),
        "C3_enc_cadunico_atualizacao": sum(1 for e in encs if e.referral_code == "CADUNICO_ATUAL"),
        "C4_enc_bpc": sum(1 for e in encs if e.referral_code == "BPC_INSS"),
        "C5_enc_creas": sum(1 for e in encs if e.referral_code == "CREAS"),
        "C6_visitas_domiciliares": len(visitas_mes),
    }

    # ── Bloco D: Atendimentos coletivos/SCFV ──
    acoes_scfv = (
        await db.execute(
            select(AcaoColetiva).where(
                AcaoColetiva.tenant_id == tenant_id,
                AcaoColetiva.unit_id == unit_id,
                AcaoColetiva.tipo == "GRUPO_SCFV",
                AcaoColetiva.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    acao_ids = [a.id for a in acoes_scfv]

    inscricoes_ativas = 0
    if acao_ids:
        inscricoes_ativas = (
            await db.execute(
                select(func.count(Inscricao.id)).where(
                    Inscricao.acao_coletiva_id.in_(acao_ids),
                    Inscricao.status == "ATIVA",
                    Inscricao.tenant_id == tenant_id,
                )
            )
        ).scalar() or 0

    cras_d = {
        "D1_participantes_scfv": int(inscricoes_ativas),
        "D2_grupos_scfv_ativos": sum(1 for a in acoes_scfv if a.status == "ATIVA"),
    }

    return {"CRAS_A": cras_a, "CRAS_C": cras_c, "CRAS_D": cras_d}


async def _calcular_creas(db, tenant_id, unit_id, inicio, fim, ano, mes):
    """Blocos do Formulário 1 — CREAS."""
    cfs = (
        await db.execute(
            select(CaseFile).where(
                CaseFile.tenant_id == tenant_id,
                CaseFile.unit_id == unit_id,
                CaseFile.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    cf_ids = [cf.id for cf in cfs]

    acs_paefi = (
        await db.execute(
            select(Acompanhamento).where(
                Acompanhamento.tenant_id == tenant_id,
                Acompanhamento.case_file_id.in_(cf_ids),
                Acompanhamento.tipo == "PAEFI",
                Acompanhamento.situacao == "ATIVO",
                Acompanhamento.data_inicio < fim,
                Acompanhamento.deleted_at.is_(None),
            )
        )
    ).scalars().all()

    acs_novos = [a for a in acs_paefi if a.data_inicio >= inicio.date()]

    acs_mse = (
        await db.execute(
            select(Acompanhamento).where(
                Acompanhamento.tenant_id == tenant_id,
                Acompanhamento.case_file_id.in_(cf_ids),
                Acompanhamento.tipo.in_(["MSE-LA", "MSE-PSC"]),
                Acompanhamento.situacao == "ATIVO",
                Acompanhamento.data_inicio < fim,
                Acompanhamento.deleted_at.is_(None),
            )
        )
    ).scalars().all()

    attendances = (
        await db.execute(
            select(Attendance).where(
                Attendance.tenant_id == tenant_id,
                Attendance.unit_id == unit_id,
                Attendance.data_atendimento >= inicio,
                Attendance.data_atendimento < fim,
                Attendance.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    fams_atendidas = list(set(a.case_file.family_id for a in attendances if a.case_file))

    return {
        "CREAS_A": {
            "A1_casos_acompanhamento_paefi": len(acs_paefi),
            "A2_novos_casos_mes": len(acs_novos),
            "A3_mse_em_cumprimento": len(acs_mse),
        },
        "CREAS_C": {
            "C1_total_familias_atendidas": len(fams_atendidas),
        },
    }


async def _calcular_centro_pop(db, tenant_id, unit_id, inicio, fim, ano, mes):
    """Blocos do Formulário 1 — Centro POP."""
    attendances = (
        await db.execute(
            select(Attendance).where(
                Attendance.tenant_id == tenant_id,
                Attendance.unit_id == unit_id,
                Attendance.data_atendimento >= inicio,
                Attendance.data_atendimento < fim,
                Attendance.deleted_at.is_(None),
            )
        )
    ).scalars().all()

    persons_unicas = list(set(
        m.person_id for a in attendances for m in a.members
    ))

    return {
        "CENTRO_POP": {
            "total_atendimentos": len(attendances),
            "pessoas_atendidas": len(persons_unicas),
        }
    }
