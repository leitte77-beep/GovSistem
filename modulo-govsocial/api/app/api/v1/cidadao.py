"""Endpoints públicos do Portal do Cidadão.

Autenticação simplificada: CPF + data de nascimento.
"""

import logging
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.beneficio import ConcessaoBeneficio
from app.models.encaminhamento import Encaminhamento
from app.models.family import Family
from app.models.person import Person
from app.models.person_family_membership import PersonFamilyMembership
from app.models.agenda import Appointment

logger = logging.getLogger("govsocial.cidadao")

router = APIRouter(tags=["Portal do Cidadão"], prefix="/cidadao")


class CidadaoLogin(BaseModel):
    cpf: str = Field(..., min_length=11, max_length=14, description="CPF apenas dígitos")
    data_nascimento: str = Field(..., description="Data de nascimento AAAA-MM-DD")


class CidadaoDados(BaseModel):
    nome: str
    nome_social: str | None = None
    familia_codigo: int | None = None
    bairro: str | None = None


class AgendamentoCidadao(BaseModel):
    id: str
    data: str
    horario: str
    unidade: str
    servico: str
    status: str


class BeneficioCidadao(BaseModel):
    id: str
    tipo: str
    status: str
    data_solicitacao: str | None = None
    data_entrega: str | None = None
    valor: float | None = None


class EncaminhamentoCidadao(BaseModel):
    id: str
    tipo: str
    destino: str
    data: str
    status: str


@router.post("/login")
async def cidadao_login(
    body: CidadaoLogin,
    db: AsyncSession = Depends(get_db),
):
    """Autentica o cidadão por CPF + data de nascimento."""
    clean_cpf = body.cpf.replace(".", "").replace("-", "").strip()

    person = (
        await db.execute(
            select(Person).where(
                Person.cpf == clean_cpf,
                Person.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()

    if not person:
        raise HTTPException(status_code=404, detail="CPF não encontrado na base de dados.")

    if person.data_nascimento and str(person.data_nascimento) != body.data_nascimento:
        raise HTTPException(status_code=401, detail="Data de nascimento não confere.")

    membership = (
        await db.execute(
            select(PersonFamilyMembership).where(
                PersonFamilyMembership.person_id == person.id,
                PersonFamilyMembership.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()

    familia = None
    if membership:
        familia = (
            await db.execute(
                select(Family).where(
                    Family.id == membership.family_id,
                    Family.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()

    return {
        "token": _gerar_token_cidadao(person.id),
        "dados": {
            "nome": person.nome_civil,
            "nome_social": person.nome_social,
            "familia_codigo": familia.codigo if familia else None,
            "bairro": familia.bairro if familia else None,
        },
    }


@router.get("/agendamentos")
async def cidadao_agendamentos(
    cpf: str = Query(..., description="CPF apenas dígitos"),
    data_nascimento: str = Query(..., description="AAAA-MM-DD"),
    db: AsyncSession = Depends(get_db),
) -> list[AgendamentoCidadao]:
    """Lista agendamentos futuros do cidadão."""
    person = await _validar_cidadao(db, cpf, data_nascimento)

    agendamentos = (
        await db.execute(
            select(Appointment).where(
                Appointment.person_id == person.id,
                Appointment.deleted_at.is_(None),
                Appointment.data >= date.today(),
            ).order_by(Appointment.data, Appointment.horario_inicio)
        )
    ).scalars().all()

    return [
        AgendamentoCidadao(
            id=a.id,
            data=str(a.data),
            horario=str(a.horario_inicio) if a.horario_inicio else "",
            unidade=a.unit_name or "",
            servico=a.service_name or "",
            status=a.status or "AGENDADO",
        )
        for a in agendamentos
    ]


@router.get("/beneficios")
async def cidadao_beneficios(
    cpf: str = Query(..., description="CPF apenas dígitos"),
    data_nascimento: str = Query(..., description="AAAA-MM-DD"),
    db: AsyncSession = Depends(get_db),
) -> list[BeneficioCidadao]:
    """Lista benefícios do cidadão."""
    person = await _validar_cidadao(db, cpf, data_nascimento)

    membership = (
        await db.execute(
            select(PersonFamilyMembership).where(
                PersonFamilyMembership.person_id == person.id,
                PersonFamilyMembership.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()

    family_id = membership.family_id if membership else None

    beneficios = (
        await db.execute(
            select(ConcessaoBeneficio).where(
                ConcessaoBeneficio.deleted_at.is_(None),
            ).order_by(ConcessaoBeneficio.created_at.desc()).limit(20)
        )
    ).scalars().all()

    return [
        BeneficioCidadao(
            id=b.id,
            tipo=b.benefit_type_name or "",
            status=b.status or "SOLICITADO",
            data_solicitacao=str(b.created_at.date()) if b.created_at else None,
            data_entrega=str(b.data_entrega) if b.data_entrega else None,
            valor=b.valor,
        )
        for b in beneficios
        if family_id and getattr(b, "family_id", None) == family_id
    ]


@router.get("/encaminhamentos")
async def cidadao_encaminhamentos(
    cpf: str = Query(..., description="CPF apenas dígitos"),
    data_nascimento: str = Query(..., description="AAAA-MM-DD"),
    db: AsyncSession = Depends(get_db),
) -> list[EncaminhamentoCidadao]:
    """Lista encaminhamentos do cidadão."""
    person = await _validar_cidadao(db, cpf, data_nascimento)

    encs = (
        await db.execute(
            select(Encaminhamento).where(
                Encaminhamento.person_id == person.id,
                Encaminhamento.deleted_at.is_(None),
            ).order_by(Encaminhamento.created_at.desc()).limit(10)
        )
    ).scalars().all()

    return [
        EncaminhamentoCidadao(
            id=e.id,
            tipo=e.tipo or "",
            destino=e.destino_nome or "",
            data=str(e.created_at.date()) if e.created_at else "",
            status=e.status or "PENDENTE",
        )
        for e in encs
    ]


async def _validar_cidadao(db: AsyncSession, cpf: str, data_nasc: str) -> Person:
    clean_cpf = cpf.replace(".", "").replace("-", "").strip()
    person = (
        await db.execute(
            select(Person).where(
                Person.cpf == clean_cpf,
                Person.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()

    if not person:
        raise HTTPException(status_code=404, detail="CPF não encontrado.")

    if person.data_nascimento and str(person.data_nascimento) != data_nasc:
        raise HTTPException(status_code=401, detail="Data de nascimento não confere.")

    return person


def _gerar_token_cidadao(person_id: str) -> str:
    """Gera token simples para sessão do cidadão."""
    import hashlib
    import os
    raw = f"{person_id}:{os.urandom(16).hex()}:{datetime.utcnow().isoformat()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]
