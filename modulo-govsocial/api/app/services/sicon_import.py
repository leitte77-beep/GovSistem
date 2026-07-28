"""Parser de arquivos SICON (Sistema de Gestao de Condicionalidades do MDS)."""
import csv
import io
import re
from datetime import date, datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family import Family
from app.models.importacao import ImportJob, ImportLog
from app.models.sicon import SiconData


SICON_COLUMNS = [
    "nis_responsavel", "data_referencia", "descumprimento_educacao",
    "descumprimento_saude", "efeito_beneficio", "data_efeito",
    "membros_afetados", "observacoes",
]


def _normalize(v: str) -> str:
    return (v or "").strip()


def _parse_date_br(v: str) -> Optional[date]:
    v = _normalize(v)
    if not v:
        return None
    try:
        return datetime.strptime(v, "%d/%m/%Y").date()
    except ValueError:
        pass
    try:
        return datetime.strptime(v, "%Y-%m-%d").date()
    except ValueError:
        pass
    return None


def _parse_mes_ref(v: str) -> Optional[date]:
    """Interpreta mes/ano de referencia: MM/AAAA ou MM-AAAA."""
    v = _normalize(v)
    if not v:
        return None
    for fmt in ("%m/%Y", "%m-%Y", "%Y-%m"):
        try:
            return datetime.strptime(v, fmt).date().replace(day=1)
        except ValueError:
            continue
    return None


def _parse_bool_sim_nao(v: str) -> bool:
    v = _normalize(v).upper()
    return v in ("S", "SIM", "TRUE", "1", "X")


async def parse_sicon_csv(
    db: AsyncSession,
    job: ImportJob,
    content: str,
) -> dict:
    """Faz parsing do CSV SICON e reconcilia com familias existentes."""
    try:
        job.status = "PARSING"
        await db.commit()

        reader = csv.DictReader(io.StringIO(content), delimiter=";")
        rows = list(reader)
        job.total_linhas = len(rows)
        job.linhas_processadas = 0
        await db.commit()

        resultados = {"novos": 0, "atualizados": 0, "conflitos": 0, "erros": 0}
        tenant_id = job.tenant_id
        mes_ref_detectado: Optional[date] = None

        for i, row in enumerate(rows, start=1):
            try:
                nis = _normalize(row.get("nis_responsavel", row.get("NIS", "")))
                if not nis:
                    _log_import(db, job, i, "ERRO", mensagem="NIS responsavel vazio")
                    resultados["erros"] += 1
                    continue

                data_ref = _parse_mes_ref(row.get("data_referencia", row.get("MES_REFERENCIA", "")))
                if data_ref is None:
                    data_ref = date.today().replace(day=1)
                if mes_ref_detectado is None:
                    mes_ref_detectado = data_ref

                desc_educ = _parse_bool_sim_nao(row.get("descumprimento_educacao", ""))
                desc_saude = _parse_bool_sim_nao(row.get("descumprimento_saude", ""))
                efeito = _normalize(row.get("efeito_beneficio", "")) or None
                data_efeito = _parse_date_br(row.get("data_efeito", ""))
                membros = _normalize(row.get("membros_afetados", "")) or None
                obs = _normalize(row.get("observacoes", "")) or None

                family = (
                    await db.execute(
                        select(Family).where(
                            Family.tenant_id == tenant_id,
                            Family.nis_responsavel == nis,
                            Family.deleted_at.is_(None),
                        )
                    )
                ).scalar_one_or_none()

                existing = (
                    await db.execute(
                        select(SiconData).where(
                            SiconData.tenant_id == tenant_id,
                            SiconData.nis_responsavel == nis,
                            SiconData.data_referencia == data_ref,
                        )
                    )
                ).scalar_one_or_none()

                if existing:
                    existing.descumprimento_educacao = desc_educ
                    existing.descumprimento_saude = desc_saude
                    existing.efeito_beneficio = efeito
                    existing.data_efeito = data_efeito
                    existing.membros_afetados = membros
                    existing.observacoes = obs
                    if family and not existing.family_id:
                        existing.family_id = family.id
                    resultados["atualizados"] += 1
                    _log_import(db, job, i, "ATUALIZADO", nis=nis,
                                family_id_match=family.id if family else None)
                else:
                    sicon = SiconData(
                        tenant_id=tenant_id,
                        family_id=family.id if family else None,
                        nis_responsavel=nis,
                        data_referencia=data_ref,
                        descumprimento_educacao=desc_educ,
                        descumprimento_saude=desc_saude,
                        efeito_beneficio=efeito,
                        data_efeito=data_efeito,
                        membros_afetados=membros,
                        observacoes=obs,
                    )
                    db.add(sicon)
                    resultados["novos"] += 1
                    _log_import(db, job, i, "NOVO", nis=nis,
                                family_id_match=family.id if family else None)

                job.linhas_processadas = i
            except Exception as e:
                _log_import(db, job, i, "ERRO", mensagem=str(e))
                resultados["erros"] += 1

        job.novos = resultados["novos"]
        job.atualizados = resultados["atualizados"]
        job.conflitos = resultados["conflitos"]
        job.erros = resultados["erros"]
        job.status = "RECONCILED"
        await db.commit()
        return {**resultados, "data_referencia": mes_ref_detectado}
    except Exception:
        job.status = "ERROR"
        await db.commit()
        raise


async def get_sicon_family_summary(
    db: AsyncSession, tenant_id, family_id,
) -> dict:
    """Retorna resumo SICON para uma familia."""
    registros = (
        await db.execute(
            select(SiconData).where(
                SiconData.tenant_id == tenant_id,
                SiconData.family_id == family_id,
            ).order_by(SiconData.data_referencia.desc())
        )
    ).scalars().all()

    if not registros:
        return {
            "family_id": family_id,
            "nis_responsavel": "",
            "possui_descumprimento": False,
            "descumprimento_educacao": False,
            "descumprimento_saude": False,
            "efeito_atual": None,
            "data_ultima_atualizacao": date.today(),
            "registros": [],
        }

    ultimo = registros[0]
    return {
        "family_id": family_id,
        "nis_responsavel": ultimo.nis_responsavel,
        "possui_descumprimento": ultimo.descumprimento_educacao or ultimo.descumprimento_saude,
        "descumprimento_educacao": ultimo.descumprimento_educacao,
        "descumprimento_saude": ultimo.descumprimento_saude,
        "efeito_atual": ultimo.efeito_beneficio,
        "data_ultima_atualizacao": ultimo.data_referencia,
        "registros": registros,
    }


def _log_import(db, job, linha, status, nis=None, mensagem=None, family_id_match=None):
    db.add(ImportLog(
        tenant_id=job.tenant_id, import_job_id=job.id,
        linha=linha, status=status, nis=nis,
        mensagem=mensagem, dados_originais={"linha": linha},
        family_id_match=family_id_match,
    ))
