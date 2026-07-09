"""Parser de arquivos CadÚnico e motor de conciliação."""
import csv
import io
from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family import Family
from app.models.importacao import ImportJob, ImportLog
from app.models.person import Person
from app.models.person_family_membership import PersonFamilyMembership
from app.services.people import build_person_busca

CADUNICO_COLUMNS = [
    "nis_responsavel", "nome_responsavel", "cpf_responsavel",
    "nis_pessoa", "nome_pessoa", "cpf_pessoa", "data_nascimento",
    "parentesco", "sexo", "escolaridade",
    "logradouro", "numero", "complemento", "bairro", "cep",
    "municipio", "uf", "faixa_renda", "pbf", "bpc",
]


def _normalize(v: str) -> str:
    return (v or "").strip()


def _parse_bool(v: str) -> Optional[bool]:
    v = _normalize(v).upper()
    if v in ("S", "SIM", "TRUE", "1"):
        return True
    if v in ("N", "NAO", "NÃO", "FALSE", "0"):
        return False
    return None


async def parse_cadunico_csv(
    db: AsyncSession,
    job: ImportJob,
    content: str,
) -> dict:
    """Faz parsing do CSV CadÚnico e reconcilia com o cadastro existente."""
    try:
        job.status = "PARSING"
        await db.commit()

        reader = csv.DictReader(io.StringIO(content), delimiter=";")
        rows = list(reader)
        job.total_linhas = len(rows)
        job.linhas_processadas = 0
        await db.commit()

        resultados = {"novos": 0, "atualizados": 0, "conflitos": 0, "erros": 0}
        familias_vistas: dict[str, list[dict]] = {}  # nis_resp → persons

        for i, row in enumerate(rows, start=1):
            try:
                nis_resp = _normalize(row.get("nis_responsavel", ""))
                if not nis_resp:
                    _log(db, job, i, "ERRO", mensagem="NIS responsável vazio")
                    resultados["erros"] += 1
                    continue

                if nis_resp not in familias_vistas:
                    familias_vistas[nis_resp] = []
                familias_vistas[nis_resp].append({
                    "nis_pessoa": _normalize(row.get("nis_pessoa", "")),
                    "nome_pessoa": _normalize(row.get("nome_pessoa", "")),
                    "cpf_pessoa": _normalize(row.get("cpf_pessoa", "")),
                    "data_nascimento": _normalize(row.get("data_nascimento", "")),
                    "parentesco": _normalize(row.get("parentesco", "")),
                    "sexo": _normalize(row.get("sexo", "")),
                    "escolaridade": _normalize(row.get("escolaridade", "")),
                    "extra": {
                        "logradouro": _normalize(row.get("logradouro", "")),
                        "numero": _normalize(row.get("numero", "")),
                        "bairro": _normalize(row.get("bairro", "")),
                        "cep": _normalize(row.get("cep", "")),
                        "municipio": _normalize(row.get("municipio", "")),
                        "uf": _normalize(row.get("uf", "")),
                        "faixa_renda": _normalize(row.get("faixa_renda", "")),
                        "pbf": _normalize(row.get("pbf", "")),
                        "bpc": _normalize(row.get("bpc", "")),
                        "nome_responsavel": _normalize(row.get("nome_responsavel", "")),
                        "cpf_responsavel": _normalize(row.get("cpf_responsavel", "")),
                    },
                })
                job.linhas_processadas = i
            except Exception as e:
                _log(db, job, i, "ERRO", mensagem=str(e))
                resultados["erros"] += 1

        job.status = "RECONCILING"
        await db.commit()

        # Reconciliação por NIS do responsável
        for nis_resp, members in familias_vistas.items():
            try:
                await _reconcile_family(db, job, nis_resp, members, resultados)
            except Exception as e:
                _log(db, job, 0, "ERRO", nis=nis_resp, mensagem=str(e))
                resultados["erros"] += len(members)

        job.novos = resultados["novos"]
        job.atualizados = resultados["atualizados"]
        job.conflitos = resultados["conflitos"]
        job.erros = resultados["erros"]
        job.status = "RECONCILED"
        await db.commit()
        return resultados
    except Exception:
        job.status = "ERROR"
        await db.commit()
        raise


async def _reconcile_family(
    db, job, nis_resp, members, resultados,
):
    tenant_id = job.tenant_id
    extra = members[0]["extra"]

    fam_existente = (
        await db.execute(
            select(Family).where(
                Family.tenant_id == tenant_id,
                Family.nis_responsavel == nis_resp,
                Family.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()

    if fam_existente:
        # Atualiza flags
        pbf_val = _parse_bool(extra.get("pbf", ""))
        if pbf_val is not None:
            fam_existente.beneficiaria_pbf = pbf_val
        bpc_val = _parse_bool(extra.get("bpc", ""))
        if bpc_val is not None:
            fam_existente.possui_bpc = bpc_val
        if extra.get("faixa_renda"):
            fam_existente.faixa_renda = extra["faixa_renda"]
        fam_existente.cadunico_atualizado_em = date.today()
        resultados["atualizados"] += 1
        _log(db, job, 0, "ATUALIZADO", nis=nis_resp,
             family_id_match=fam_existente.id)
        return

    # Nova família
    codigo = (
        await db.execute(
            select(Family.codigo).where(Family.tenant_id == tenant_id)
            .order_by(Family.codigo.desc())
        )
    ).scalar() or 0
    codigo += 1

    fam = Family(
        tenant_id=tenant_id,
        codigo=codigo,
        nis_responsavel=nis_resp,
        bairro=extra.get("bairro") or "Não informado",
        territorio=extra.get("bairro") or "Não informado",
        municipio=extra.get("municipio") or "Não informado",
        uf=extra.get("uf") or "",
        faixa_renda=extra.get("faixa_renda") or "NAO_INFORMADO",
        beneficiaria_pbf=_parse_bool(extra.get("pbf", "")),
        possui_bpc=_parse_bool(extra.get("bpc", "")),
        no_cadunico=True,
        cadunico_atualizado_em=date.today(),
        observacoes={},
    )
    if extra.get("logradouro"):
        fam.logradouro = extra["logradouro"]
    if extra.get("cep"):
        fam.cep = extra["cep"]
    db.add(fam)
    await db.flush()

    resp_nome = extra.get("nome_responsavel", "")
    resp_cpf = extra.get("cpf_responsavel", "")
    resp = await _find_or_create_person(
        db, tenant_id, nis_resp, resp_nome, resp_cpf,
    )
    fam.responsavel_id = resp.id
    db.add(PersonFamilyMembership(
        tenant_id=tenant_id, person_id=resp.id, family_id=fam.id,
        parentesco="RESPONSAVEL", status="ATIVO", data_entrada=date.today(),
    ))

    resultados["novos"] += 1
    _log(db, job, 0, "NOVO", nis=nis_resp, family_id_match=fam.id)

    # Membros adicionais
    for m in members:
        nis = m.get("nis_pessoa") or ""
        if nis == nis_resp:
            continue
        nome = m.get("nome_pessoa") or ""
        cpf = m.get("cpf_pessoa") or ""
        pessoa = await _find_or_create_person(db, tenant_id, nis, nome, cpf)
        db.add(PersonFamilyMembership(
            tenant_id=tenant_id, person_id=pessoa.id, family_id=fam.id,
            parentesco=m.get("parentesco") or "OUTRO_PARENTE",
            status="ATIVO", data_entrada=date.today(),
        ))
        _log(db, job, 0, "NOVO", nis=nis, family_id_match=fam.id)


async def _find_or_create_person(
    db, tenant_id, nis, nome, cpf,
) -> Person:
    clean_cpf = _normalize(cpf)
    clean_nis = _normalize(nis)

    if clean_cpf:
        existing = (
            await db.execute(
                select(Person).where(
                    Person.tenant_id == tenant_id,
                    Person.cpf == clean_cpf,
                    Person.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if existing:
            return existing

    if clean_nis:
        existing = (
            await db.execute(
                select(Person).where(
                    Person.tenant_id == tenant_id,
                    Person.nis == clean_nis,
                    Person.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if existing:
            return existing

    p = Person(
        tenant_id=tenant_id,
        nome_civil=nome or "Sem nome",
        busca=build_person_busca(nome or "Sem nome", None),
        cpf=clean_cpf or None,
        nis=clean_nis or None,
        sexo="NAO_INFORMADO",
    )
    db.add(p)
    await db.flush()
    return p


def _log(db, job, linha, status, nis=None, cpf=None, nome=None, mensagem=None,
         family_id_match=None):
    dados = {"linha": linha}
    db.add(ImportLog(
        tenant_id=job.tenant_id, import_job_id=job.id,
        linha=linha, status=status, nis=nis, cpf=cpf, nome=nome,
        mensagem=mensagem, dados_originais=dados,
        family_id_match=family_id_match,
    ))
