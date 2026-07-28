"""Serviço de atendimento a direitos do titular (LGPD arts. 17-22).

- Extrato de dados pessoais
- Correção de dados incompletos/inexatos
- Eliminação com salvaguarda de obrigações legais
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import Attendance
from app.models.beneficio import ConcessaoBeneficio
from app.models.case_file import CaseFile
from app.models.encaminhamento import Encaminhamento
from app.models.person import Person
from app.models.person_family_membership import PersonFamilyMembership


async def get_data_extract(
    db: AsyncSession, tenant_id: uuid.UUID, person_id: uuid.UUID,
) -> dict:
    """Gera extrato de todos os dados pessoais do titular no sistema."""
    person = (
        await db.execute(
            select(Person).where(
                Person.id == person_id, Person.tenant_id == tenant_id,
                Person.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not person:
        return {}

    memberships = (
        await db.execute(
            select(PersonFamilyMembership).where(
                PersonFamilyMembership.person_id == person_id,
                PersonFamilyMembership.tenant_id == tenant_id,
            )
        )
    ).scalars().all()

    family_ids = [m.family_id for m in memberships]

    # Atendimentos onde a pessoa foi membro
    attendances = []
    if family_ids:
        cfs = (
            await db.execute(
                select(CaseFile.id).where(
                    CaseFile.family_id.in_(family_ids),
                    CaseFile.tenant_id == tenant_id,
                )
            )
        ).scalars().all()
        cf_ids = [c for c in cfs]
        if cf_ids:
            from app.models.attendance import AttendanceMember
            att_ids = (
                await db.execute(
                    select(AttendanceMember.attendance_id).where(
                        AttendanceMember.person_id == person_id,
                        AttendanceMember.tenant_id == tenant_id,
                    )
                )
            ).scalars().all()
            if att_ids:
                atts = (
                    await db.execute(
                        select(Attendance).where(Attendance.id.in_(att_ids))
                    )
                ).scalars().all()
                attendances = [
                    {"id": str(a.id), "data": a.data_atendimento.isoformat(),
                     "tipo": a.tipo, "service": a.service_type_code}
                    for a in atts
                ]

    # Benefícios recebidos
    beneficios = (
        await db.execute(
            select(ConcessaoBeneficio).where(
                ConcessaoBeneficio.tenant_id == tenant_id,
                ConcessaoBeneficio.person_id == person_id,
            ).order_by(ConcessaoBeneficio.data_solicitacao.desc())
        )
    ).scalars().all()

    # Encaminhamentos
    encaminhamentos = []
    if family_ids:
        encs = (
            await db.execute(
                select(Encaminhamento).where(
                    Encaminhamento.tenant_id == tenant_id,
                    Encaminhamento.case_file_id.in_(cf_ids) if cf_ids else False,
                    Encaminhamento.deleted_at.is_(None),
                )
            )
        ).scalars().all()
        encaminhamentos = [
            {"id": str(e.id), "data": e.data_encaminhamento.isoformat(),
             "tipo": e.tipo, "status": e.status, "motivo": e.motivo}
            for e in encs
        ]

    return {
        "dados_cadastrais": {
            "nome_civil": person.nome_civil,
            "nome_social": person.nome_social,
            "cpf": person.cpf,
            "nis": person.nis,
            "data_nascimento": (
                person.data_nascimento.isoformat()
                if person.data_nascimento else None
            ),
            "sexo": person.sexo,
            "escolaridade": person.escolaridade,
        },
        "familias": [
            {"family_id": str(m.family_id), "parentesco": m.parentesco,
             "data_entrada": m.data_entrada.isoformat() if m.data_entrada else None,
             "status": m.status}
            for m in memberships
        ],
        "atendimentos": attendances,
        "beneficios": [
            {"id": str(b.id), "benefit_type": b.benefit_type_code,
             "status": b.status, "data": b.data_solicitacao.isoformat()}
            for b in beneficios
        ],
        "encaminhamentos": encaminhamentos,
        "gerado_em": datetime.now(timezone.utc).isoformat(),
    }


async def correct_person_data(
    db: AsyncSession, tenant_id: uuid.UUID, person_id: uuid.UUID,
    nome_civil: Optional[str] = None,
    nome_social: Optional[str] = None,
    data_nascimento: Optional[str] = None,
    escolaridade: Optional[str] = None,
) -> dict:
    """Corrige dados cadastrais do titular (art. 18, III)."""
    person = (
        await db.execute(
            select(Person).where(
                Person.id == person_id, Person.tenant_id == tenant_id,
                Person.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not person:
        return {"error": "Pessoa não encontrada"}

    changed = []
    if nome_civil:
        person.nome_civil = nome_civil
        changed.append("nome_civil")
    if nome_social is not None:
        person.nome_social = nome_social
        changed.append("nome_social")
    if data_nascimento:
        from datetime import date as _date
        person.data_nascimento = _date.fromisoformat(data_nascimento)
        changed.append("data_nascimento")
    if escolaridade:
        person.escolaridade = escolaridade
        changed.append("escolaridade")

    await db.flush()
    return {"message": "Dados corrigidos", "campos": changed}


async def delete_person_data(
    db: AsyncSession, tenant_id: uuid.UUID, person_id: uuid.UUID,
) -> dict:
    """Elimina dados pessoais com salvaguarda de obrigações legais (art. 16, I).

    Soft-delete da pessoa e anonimização dos campos identificáveis.
    Mantém registros de atendimentos/benefícios para cumprimento de obrigação legal.
    """
    person = (
        await db.execute(
            select(Person).where(
                Person.id == person_id, Person.tenant_id == tenant_id,
                Person.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not person:
        return {"error": "Pessoa não encontrada"}

    # Anonimiza campos identificáveis
    person.nome_civil = "[ANONIMIZADO]"
    person.nome_social = None
    person.cpf = None
    person.nis = None
    person.data_nascimento = None
    person.documentos = None
    person.deleted_at = datetime.now(timezone.utc)
    person.sexo = "NAO_INFORMADO"
    person.escolaridade = "NAO_INFORMADO"

    await db.flush()
    return {"message": "Dados eliminados com salvaguarda de obrigações legais"}
