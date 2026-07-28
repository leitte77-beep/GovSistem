"""Serviço de consulta ao CadÚnico via API / gov.br.

Suporta múltiplos métodos de consulta configuráveis por organização:
- API oficial (requer certificado digital ICP-Brasil)
- Consulta local (dados já importados via CSV)
"""

import logging
from typing import Optional

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family import Family
from app.models.person import Person
from app.models.person_family_membership import PersonFamilyMembership

logger = logging.getLogger("govsocial.cadunico")


class CadUnicoConsultaError(Exception):
    """Erro ao consultar CadÚnico."""


async def consultar_por_cpf(
    db: AsyncSession,
    tenant_id: str,
    cpf: str,
) -> dict:
    """Consulta dados do CadÚnico para um CPF.

    Ordem de tentativa:
    1. Consulta local (dados já importados)
    2. API externa (se configurada)
    """
    clean_cpf = (cpf or "").replace(".", "").replace("-", "").strip()

    if not clean_cpf or len(clean_cpf) != 11:
        raise CadUnicoConsultaError("CPF inválido. Forneça 11 dígitos.")

    result = await _consulta_local(db, tenant_id, cpf=clean_cpf)
    if result:
        return result

    return await _consulta_externa(cpf=clean_cpf)


async def consultar_por_nis(
    db: AsyncSession,
    tenant_id: str,
    nis: str,
) -> dict:
    """Consulta dados do CadÚnico para um NIS."""
    clean_nis = (nis or "").replace(".", "").replace("-", "").strip()

    if not clean_nis or len(clean_nis) < 8:
        raise CadUnicoConsultaError("NIS inválido. Forneça ao menos 8 dígitos.")

    result = await _consulta_local(db, tenant_id, nis=clean_nis)
    if result:
        return result

    return await _consulta_externa(nis=clean_nis)


async def _consulta_local(
    db: AsyncSession,
    tenant_id: str,
    cpf: Optional[str] = None,
    nis: Optional[str] = None,
) -> Optional[dict]:
    """Busca nos dados já importados localmente."""
    conditions = []
    if cpf:
        conditions.append(Person.cpf == cpf)
    if nis:
        conditions.append(Person.nis == nis)
    if not conditions:
        return None

    conditions.append(Person.tenant_id == tenant_id)
    conditions.append(Person.deleted_at.is_(None))

    person = (await db.execute(select(Person).where(or_(*conditions)))).scalar_one_or_none()
    if not person:
        return None

    membership = (
        await db.execute(
            select(PersonFamilyMembership).where(
                PersonFamilyMembership.tenant_id == tenant_id,
                PersonFamilyMembership.person_id == person.id,
                PersonFamilyMembership.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()

    family = None
    if membership:
        family = (
            await db.execute(
                select(Family).where(
                    Family.tenant_id == tenant_id,
                    Family.id == membership.family_id,
                    Family.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()

    return _format_response(person, family, membership, is_from_cadunco=bool(family and family.no_cadunico))


async def _consulta_externa(
    cpf: Optional[str] = None,
    nis: Optional[str] = None,
) -> dict:
    """Consulta via API externa do CadÚnico.

    NOTA: A consulta real requer certificado digital ICP-Brasil e
    acesso à API do gov.br/MDS. Esta implementação é um stub que
    deve ser substituído pela API real quando as credenciais
    estiverem configuradas.
    """
    logger.warning(
        "consulta_cadunico_externa: stub ativo — configure credenciais gov.br "
        "para consulta real"
    )
    raise CadUnicoConsultaError(
        "Consulta ao CadÚnico não disponível. "
        "Importe os dados via CSV ou configure as credenciais de API."
    )


def _format_response(
    person: Person,
    family: Optional[Family],
    membership: Optional[PersonFamilyMembership],
    is_from_cadunco: bool = False,
) -> dict:
    """Formata resposta padronizada da consulta."""
    resp: dict = {
        "fonte": "cadunico_local" if not is_from_cadunco else "cadunico",
        "encontrado": True,
        "pessoa": {
            "id": person.id,
            "nome_civil": person.nome_civil,
            "nome_social": person.nome_social,
            "cpf": None,
            "nis": None,
            "data_nascimento": str(person.data_nascimento) if person.data_nascimento else None,
            "sexo": person.sexo,
            "mae": person.nome_mae,
        },
    }

    if is_from_cadunco and family:
        resp["familia"] = {
            "id": family.id,
            "codigo": family.codigo,
            "responsavel_nome": family.responsavel_nome,
            "faixa_renda": family.faixa_renda,
            "beneficiaria_pbf": family.beneficiaria_pbf,
            "possui_bpc": family.possui_bpc,
            "no_cadunico": True,
            "cadunico_atualizado_em": str(family.cadunico_atualizado_em) if family.cadunico_atualizado_em else None,
            "endereco": {
                "logradouro": family.logradouro,
                "numero": family.numero,
                "bairro": family.bairro,
                "cep": family.cep,
                "municipio": family.municipio,
                "uf": family.uf,
            },
        }
        if membership:
            resp["familia"]["parentesco"] = membership.parentesco

    return resp
