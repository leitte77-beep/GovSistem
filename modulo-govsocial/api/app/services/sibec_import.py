"""Parser de arquivos Sibec (Sistema de Beneficios ao Cidadao do PBF)."""
import csv
import io
from datetime import date, datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family import Family
from app.models.importacao import ImportJob, ImportLog
from app.models.person import Person
from app.models.sibec import SibecData


SIBEC_COLUMNS = [
    "nis", "nome_beneficiario", "tipo_beneficio", "valor",
    "data_concessao", "data_referencia", "situacao",
    "data_bloqueio", "motivo_bloqueio", "data_desbloqueio",
    "observacoes",
]


def _normalize(v: str) -> str:
    return (v or "").strip()


def _parse_date_br(v: str) -> Optional[date]:
    v = _normalize(v)
    if not v:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%m/%Y"):
        try:
            return datetime.strptime(v, fmt).date()
        except ValueError:
            continue
    return None


def _parse_valor(v: str) -> Optional[float]:
    v = _normalize(v)
    if not v:
        return None
    v = v.replace("R$", "").replace(".", "").replace(",", ".").strip()
    try:
        return float(v)
    except ValueError:
        return None


async def parse_sibec_csv(
    db: AsyncSession,
    job: ImportJob,
    content: str,
) -> dict:
    """Faz parsing do CSV Sibec e reconcilia com familias/pessoas existentes."""
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
                nis = _normalize(row.get("nis", row.get("NIS", "")))
                if not nis:
                    _log_import(db, job, i, "ERRO", mensagem="NIS vazio")
                    resultados["erros"] += 1
                    continue

                data_ref = _parse_date_br(row.get("data_referencia", ""))
                if data_ref is None:
                    data_ref = date.today().replace(day=1)
                if mes_ref_detectado is None:
                    mes_ref_detectado = data_ref

                nome = _normalize(row.get("nome_beneficiario", row.get("NOME", ""))) or None
                tipo = _normalize(row.get("tipo_beneficio", "")) or "Nao informado"
                valor = _parse_valor(row.get("valor", ""))
                data_conc = _parse_date_br(row.get("data_concessao", ""))
                situacao = _normalize(row.get("situacao", "")) or None
                data_bloq = _parse_date_br(row.get("data_bloqueio", ""))
                motivo_bloq = _normalize(row.get("motivo_bloqueio", "")) or None
                data_desbloq = _parse_date_br(row.get("data_desbloqueio", ""))
                obs = _normalize(row.get("observacoes", "")) or None

                person = (
                    await db.execute(
                        select(Person).where(
                            Person.tenant_id == tenant_id,
                            Person.nis == nis,
                            Person.deleted_at.is_(None),
                        )
                    )
                ).scalar_one_or_none()

                family_id = None
                if person:
                    from app.models.person_family_membership import PersonFamilyMembership
                    membership = (
                        await db.execute(
                            select(PersonFamilyMembership).where(
                                PersonFamilyMembership.tenant_id == tenant_id,
                                PersonFamilyMembership.person_id == person.id,
                                PersonFamilyMembership.status == "ATIVO",
                            )
                        )
                    ).scalar_one_or_none()
                    if membership:
                        family_id = membership.family_id

                existing = (
                    await db.execute(
                        select(SibecData).where(
                            SibecData.tenant_id == tenant_id,
                            SibecData.nis == nis,
                            SibecData.tipo_beneficio == tipo if tipo else "",
                            SibecData.data_referencia == data_ref,
                        )
                    )
                ).scalar_one_or_none()

                if existing:
                    existing.nome_beneficiario = nome
                    existing.valor = valor
                    existing.data_concessao = data_conc
                    existing.situacao = situacao
                    existing.data_bloqueio = data_bloq
                    existing.motivo_bloqueio = motivo_bloq
                    existing.data_desbloqueio = data_desbloq
                    existing.observacoes = obs
                    if person:
                        existing.person_id = person.id
                    if family_id:
                        existing.family_id = family_id
                    resultados["atualizados"] += 1
                    _log_import(db, job, i, "ATUALIZADO", nis=nis,
                                family_id_match=family_id)
                else:
                    sibec = SibecData(
                        tenant_id=tenant_id,
                        family_id=family_id,
                        person_id=person.id if person else None,
                        nis=nis,
                        nome_beneficiario=nome,
                        tipo_beneficio=tipo,
                        valor=valor,
                        data_concessao=data_conc,
                        data_referencia=data_ref,
                        situacao=situacao,
                        data_bloqueio=data_bloq,
                        motivo_bloqueio=motivo_bloq,
                        data_desbloqueio=data_desbloq,
                        observacoes=obs,
                    )
                    db.add(sibec)
                    resultados["novos"] += 1
                    _log_import(db, job, i, "NOVO", nis=nis,
                                family_id_match=family_id)

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


async def get_sibec_family_summary(
    db: AsyncSession, tenant_id, family_id,
) -> dict:
    """Retorna resumo Sibec para uma familia."""
    registros = (
        await db.execute(
            select(SibecData).where(
                SibecData.tenant_id == tenant_id,
                SibecData.family_id == family_id,
            ).order_by(SibecData.data_referencia.desc())
        )
    ).scalars().all()

    if not registros:
        return {
            "family_id": family_id,
            "nis_responsavel": "",
            "valor_total": 0.0,
            "beneficios_ativos": 0,
            "beneficios_bloqueados": 0,
            "data_ultima_atualizacao": date.today(),
            "registros": [],
        }

    valor_total = sum(r.valor or 0 for r in registros)
    ativos = sum(1 for r in registros if r.situacao and r.situacao.upper() == "ATIVO")
    bloqueados = sum(1 for r in registros if r.situacao and r.situacao.upper() in ("BLOQUEADO", "SUSPENSO"))

    return {
        "family_id": family_id,
        "nis_responsavel": registros[0].nis,
        "valor_total": valor_total,
        "beneficios_ativos": ativos,
        "beneficios_bloqueados": bloqueados,
        "data_ultima_atualizacao": registros[0].data_referencia,
        "registros": registros,
    }


def _log_import(db, job, linha, status, nis=None, mensagem=None, family_id_match=None):
    db.add(ImportLog(
        tenant_id=job.tenant_id, import_job_id=job.id,
        linha=linha, status=status, nis=nis,
        mensagem=mensagem, dados_originais={"linha": linha},
        family_id_match=family_id_match,
    ))
