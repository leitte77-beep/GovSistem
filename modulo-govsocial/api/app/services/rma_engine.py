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
from app.models.attendance import Attendance, AttendanceMember
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


# ─────────────────────────────────────────────────────────────────────────────
# Drill-down (lupa do RMA): lista os registros que compõem cada número.
#
# Espelha os mesmos filtros do motor de cálculo, campo a campo, para que a lista
# corresponda exatamente ao total apurado. NUNCA retorna PII (nome/CPF): apenas
# código de família, território, datas e link para a ficha — na linha do que o
# frontend já espera (`RmaDrillDownRegistro`).
# ─────────────────────────────────────────────────────────────────────────────


def _iso(v) -> str | None:
    if v is None:
        return None
    return v.isoformat() if hasattr(v, "isoformat") else str(v)


def _rec(referencia, descricao=None, data=None, href=None) -> dict:
    return {
        "referencia": referencia,
        "descricao": descricao or "—",
        "data": _iso(data),
        "href": href,
    }


def _fam_rec(fam: Family, data=None) -> dict:
    return _rec(
        f"Família nº {fam.codigo}",
        fam.territorio or fam.bairro or "—",
        data,
        f"/familias/{fam.id}",
    )


async def _load_families(db, tenant_id, ids) -> dict:
    ids = [i for i in set(ids) if i]
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(Family).where(Family.id.in_(ids), Family.tenant_id == tenant_id)
        )
    ).scalars().all()
    return {f.id: f for f in rows}


async def _load_case_files(db, tenant_id, unit_id) -> dict:
    cfs = (
        await db.execute(
            select(CaseFile).where(
                CaseFile.tenant_id == tenant_id,
                CaseFile.unit_id == unit_id,
                CaseFile.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    return {cf.id: cf for cf in cfs}


async def _load_attendances(db, tenant_id, unit_id, inicio, fim):
    return (
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


async def drilldown_rma(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    unit_id: uuid.UUID,
    ano: int,
    mes: int,
    bloco: str,
    campo: str,
) -> list[dict]:
    """Registros que compõem o número (bloco, campo) do RMA da unidade no mês."""
    unit = (
        await db.execute(
            select(Unit).where(Unit.id == unit_id, Unit.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not unit:
        return []

    inicio = datetime(ano, mes, 1, tzinfo=timezone.utc)
    fim = (
        datetime(ano + 1, 1, 1, tzinfo=timezone.utc)
        if mes == 12
        else datetime(ano, mes + 1, 1, tzinfo=timezone.utc)
    )

    if bloco in ("CRAS_A", "CRAS_C", "CRAS_D"):
        return await _dd_cras(db, tenant_id, unit_id, inicio, fim, bloco, campo)
    if bloco in ("CREAS_A", "CREAS_C"):
        return await _dd_creas(db, tenant_id, unit_id, inicio, fim, bloco, campo)
    if bloco == "CENTRO_POP":
        return await _dd_centro_pop(db, tenant_id, unit_id, inicio, fim, campo)
    return []


async def _dd_cras(db, tenant_id, unit_id, inicio, fim, bloco, campo):
    cf_by_id = await _load_case_files(db, tenant_id, unit_id)
    cf_ids = list(cf_by_id.keys())

    if bloco == "CRAS_A":
        acs = []
        if cf_ids:
            acs = (
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
        acs_by_family: dict = {}
        for ac in acs:
            cf = cf_by_id.get(ac.case_file_id)
            if cf:
                acs_by_family.setdefault(cf.family_id, []).append(ac)
        fams = await _load_families(db, tenant_id, acs_by_family.keys())
        ini_d, fim_d = inicio.date(), fim.date()

        def _regs(filtra, data_de):
            out = []
            for fid, lista in acs_by_family.items():
                fam = fams.get(fid)
                if not fam or not filtra(fam, lista):
                    continue
                datas = [a.data_inicio for a in lista if data_de(a)]
                out.append(_fam_rec(fam, min(datas) if datas else None))
            return sorted(out, key=lambda r: r["referencia"])

        if campo == "A1_familias_acompanhamento":
            return _regs(lambda f, _acs: True, lambda a: True)
        if campo == "A2_familias_novas_mes":
            return _regs(
                lambda f, _acs: any(ini_d <= a.data_inicio <= fim_d for a in _acs),
                lambda a: ini_d <= a.data_inicio <= fim_d,
            )
        if campo == "A3_extrema_pobreza":
            return _regs(lambda f, _acs: f.faixa_renda == "EXTREMA_POBREZA", lambda a: True)
        if campo == "A4_beneficiarias_pbf":
            return _regs(lambda f, _acs: f.beneficiaria_pbf, lambda a: True)
        if campo == "A5_membros_bpc":
            return _regs(lambda f, _acs: f.possui_bpc, lambda a: True)
        return []

    if bloco == "CRAS_C":
        if campo == "C1_total_familias_atendidas":
            atts = await _load_attendances(db, tenant_id, unit_id, inicio, fim)
            por_familia: dict = {}
            for a in atts:
                if a.tipo in ("GRUPO", "ACAO_COLETIVA"):
                    continue
                cf = cf_by_id.get(a.case_file_id)
                if cf:
                    d = por_familia.get(cf.family_id)
                    if d is None or a.data_atendimento < d:
                        por_familia[cf.family_id] = a.data_atendimento
            fams = await _load_families(db, tenant_id, por_familia.keys())
            return sorted(
                [_fam_rec(fams[fid], dt) for fid, dt in por_familia.items() if fid in fams],
                key=lambda r: r["referencia"],
            )

        code_map = {
            "C2_enc_cadunico_inclusao": "CADUNICO_INCL",
            "C3_enc_cadunico_atualizacao": "CADUNICO_ATUAL",
            "C4_enc_bpc": "BPC_INSS",
            "C5_enc_creas": "CREAS",
        }
        if campo in code_map:
            encs = (
                await db.execute(
                    select(Encaminhamento).where(
                        Encaminhamento.tenant_id == tenant_id,
                        Encaminhamento.unit_id == unit_id,
                        Encaminhamento.referral_code == code_map[campo],
                        Encaminhamento.data_encaminhamento >= inicio,
                        Encaminhamento.data_encaminhamento < fim,
                        Encaminhamento.deleted_at.is_(None),
                    )
                )
            ).scalars().all()
            return [
                _rec(
                    f"Ofício nº {e.numero_oficio}" if e.numero_oficio else "Encaminhamento",
                    e.instituicao_destino or e.referral_code,
                    e.data_encaminhamento,
                )
                for e in encs
            ]

        if campo == "C6_visitas_domiciliares":
            visitas = (
                await db.execute(
                    select(VisitaDomiciliar).where(
                        VisitaDomiciliar.tenant_id == tenant_id,
                        VisitaDomiciliar.unit_id == unit_id,
                        VisitaDomiciliar.deleted_at.is_(None),
                    )
                )
            ).scalars().all()
            visitas = [
                v for v in visitas
                if v.data_realizada and inicio <= v.data_realizada < fim
            ]
            fams = await _load_families(db, tenant_id, [v.family_id for v in visitas])
            regs = []
            for v in visitas:
                fam = fams.get(v.family_id)
                if fam:
                    r = _fam_rec(fam, v.data_realizada)
                    r["descricao"] = "Visita domiciliar"
                    regs.append(r)
                else:
                    regs.append(_rec("Visita domiciliar", None, v.data_realizada))
            return regs
        return []

    if bloco == "CRAS_D":
        acoes = (
            await db.execute(
                select(AcaoColetiva).where(
                    AcaoColetiva.tenant_id == tenant_id,
                    AcaoColetiva.unit_id == unit_id,
                    AcaoColetiva.tipo == "GRUPO_SCFV",
                    AcaoColetiva.deleted_at.is_(None),
                )
            )
        ).scalars().all()
        if campo == "D2_grupos_scfv_ativos":
            return [
                _rec(a.nome, "Grupo SCFV", a.data_inicio)
                for a in acoes if a.status == "ATIVA"
            ]
        if campo == "D1_participantes_scfv":
            acao_ids = [a.id for a in acoes]
            nome_por_acao = {a.id: a.nome for a in acoes}
            if not acao_ids:
                return []
            inscricoes = (
                await db.execute(
                    select(Inscricao).where(
                        Inscricao.tenant_id == tenant_id,
                        Inscricao.acao_coletiva_id.in_(acao_ids),
                        Inscricao.status == "ATIVA",
                    )
                )
            ).scalars().all()
            return [
                _rec("Inscrição SCFV", nome_por_acao.get(i.acao_coletiva_id), i.data_inscricao)
                for i in inscricoes
            ]
        return []

    return []


async def _dd_creas(db, tenant_id, unit_id, inicio, fim, bloco, campo):
    cf_by_id = await _load_case_files(db, tenant_id, unit_id)
    cf_ids = list(cf_by_id.keys())

    if bloco == "CREAS_A":
        tipos_por_campo = {
            "A1_casos_acompanhamento_paefi": (["PAEFI"], "PAEFI"),
            "A2_novos_casos_mes": (["PAEFI"], "PAEFI (novo no mês)"),
            "A3_mse_em_cumprimento": (["MSE-LA", "MSE-PSC"], "MSE"),
        }
        if campo not in tipos_por_campo or not cf_ids:
            return []
        tipos, rotulo = tipos_por_campo[campo]
        acs = (
            await db.execute(
                select(Acompanhamento).where(
                    Acompanhamento.tenant_id == tenant_id,
                    Acompanhamento.case_file_id.in_(cf_ids),
                    Acompanhamento.tipo.in_(tipos),
                    Acompanhamento.situacao == "ATIVO",
                    Acompanhamento.data_inicio < fim,
                    Acompanhamento.deleted_at.is_(None),
                )
            )
        ).scalars().all()
        if campo == "A2_novos_casos_mes":
            acs = [a for a in acs if a.data_inicio >= inicio.date()]
        fam_ids = [
            cf_by_id[a.case_file_id].family_id
            for a in acs if a.case_file_id in cf_by_id
        ]
        fams = await _load_families(db, tenant_id, fam_ids)
        regs = []
        for a in acs:
            cf = cf_by_id.get(a.case_file_id)
            fam = fams.get(cf.family_id) if cf else None
            if fam:
                regs.append(_rec(
                    f"Família nº {fam.codigo}", rotulo, a.data_inicio,
                    f"/familias/{fam.id}",
                ))
            else:
                regs.append(_rec("Caso", rotulo, a.data_inicio))
        return sorted(regs, key=lambda r: r["referencia"])

    if bloco == "CREAS_C" and campo == "C1_total_familias_atendidas":
        atts = await _load_attendances(db, tenant_id, unit_id, inicio, fim)
        por_familia = {}
        for a in atts:
            cf = cf_by_id.get(a.case_file_id)
            if cf:
                d = por_familia.get(cf.family_id)
                if d is None or a.data_atendimento < d:
                    por_familia[cf.family_id] = a.data_atendimento
        fams = await _load_families(db, tenant_id, por_familia.keys())
        return sorted(
            [_fam_rec(fams[fid], dt) for fid, dt in por_familia.items() if fid in fams],
            key=lambda r: r["referencia"],
        )

    return []


async def _dd_centro_pop(db, tenant_id, unit_id, inicio, fim, campo):
    atts = await _load_attendances(db, tenant_id, unit_id, inicio, fim)

    if campo == "total_atendimentos":
        cf_ids = [a.case_file_id for a in atts]
        cf_by_id = {}
        if cf_ids:
            cfs = (
                await db.execute(
                    select(CaseFile).where(
                        CaseFile.id.in_(cf_ids), CaseFile.tenant_id == tenant_id
                    )
                )
            ).scalars().all()
            cf_by_id = {cf.id: cf for cf in cfs}
        fams = await _load_families(db, tenant_id, [cf.family_id for cf in cf_by_id.values()])
        regs = []
        for a in atts:
            cf = cf_by_id.get(a.case_file_id)
            fam = fams.get(cf.family_id) if cf else None
            regs.append(_rec(
                f"Família nº {fam.codigo}" if fam else "Atendimento",
                "Atendimento",
                a.data_atendimento,
                f"/familias/{fam.id}" if fam else None,
            ))
        return sorted(regs, key=lambda r: (r["data"] or ""))

    if campo == "pessoas_atendidas":
        att_ids = [a.id for a in atts]
        if not att_ids:
            return []
        pessoas = (
            await db.execute(
                select(AttendanceMember.person_id)
                .where(
                    AttendanceMember.tenant_id == tenant_id,
                    AttendanceMember.attendance_id.in_(att_ids),
                )
                .distinct()
            )
        ).scalars().all()
        # Sem PII: referência opaca (prefixo do UUID), não identifica a pessoa.
        return [
            _rec(f"Pessoa (ref. {str(pid)[:8]})", "Atendida no período")
            for pid in pessoas
        ]
    return []
