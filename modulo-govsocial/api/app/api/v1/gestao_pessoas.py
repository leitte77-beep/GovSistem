"""Endpoints de gestao de pessoas — foto, cadastro rapido, itinerantes, reativacao, historico."""
import os
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.config import settings
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.family import Family
from app.models.person import Person
from app.models.person_family_membership import PersonFamilyMembership
from app.models.user import User
from app.schemas.people import MemberOut, PersonOut
from app.services.people import build_person_busca

router = APIRouter(tags=["gestao-pessoas"])

_WRITE = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)
_READ = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.TECNICO_MEDIO.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.RECEPCAO.value,
    RoleName.ADMIN.value,
)


# ─── 3.1 FOTO ──────────────────────────────────────────

@router.post("/persons/{person_id}/foto", response_model=PersonOut)
async def upload_foto(
    person_id: uuid.UUID,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="Apenas imagens")

    person = (
        await db.execute(
            select(Person).where(
                Person.id == person_id,
                Person.tenant_id == tenant_id,
                Person.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa nao encontrada")

    ext = os.path.splitext(file.filename or "foto.jpg")[1] or ".jpg"
    nome = f"persons/{tenant_id}/{person_id}/foto{ext}"
    storage_path = os.path.join(settings.UPLOAD_DIR, nome)
    os.makedirs(os.path.dirname(storage_path), exist_ok=True)

    content = await file.read()
    with open(storage_path, "wb") as f:
        f.write(content)

    person.foto_url = f"/uploads/{nome}"
    await db.commit()
    await db.refresh(person)
    return person


# ─── 3.2 CADASTRO RÁPIDO ──────────────────────────────


class MembroRapido(BaseModel):
    nome: str
    parentesco: str = "OUTRO_PARENTE"
    cpf: str | None = None
    data_nascimento: date | None = None


class FamiliaRapidaCreate(BaseModel):
    nome_responsavel: str
    cpf_responsavel: str | None = None
    nis_responsavel: str | None = None
    data_nascimento_responsavel: date | None = None
    sexo_responsavel: str = "NAO_INFORMADO"
    bairro: str = "Nao informado"
    territorio: str = "Nao informado"
    membros: list[MembroRapido] = []


class FamiliaRapidaOut(BaseModel):
    family_id: uuid.UUID
    codigo: int
    responsavel_id: uuid.UUID
    total_membros: int


@router.post("/families/quick", response_model=FamiliaRapidaOut)
async def cadastro_rapido_familia(
    payload: FamiliaRapidaCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    codigo = (
        await db.scalar(
            select(Family.codigo).where(
                Family.tenant_id == tenant_id,
            ).order_by(Family.codigo.desc())
        )
    ) or 0
    codigo += 1

    responsavel = Person(
        tenant_id=tenant_id,
        nome_civil=payload.nome_responsavel,
        busca=build_person_busca(payload.nome_responsavel, None),
        cpf=payload.cpf_responsavel,
        nis=payload.nis_responsavel,
        data_nascimento=payload.data_nascimento_responsavel,
        sexo=payload.sexo_responsavel,
    )
    db.add(responsavel)
    await db.flush()

    family = Family(
        tenant_id=tenant_id,
        codigo=codigo,
        responsavel_id=responsavel.id,
        nis_responsavel=payload.nis_responsavel,
        bairro=payload.bairro,
        territorio=payload.territorio,
    )
    db.add(family)
    await db.flush()

    db.add(PersonFamilyMembership(
        tenant_id=tenant_id,
        person_id=responsavel.id,
        family_id=family.id,
        parentesco="RESPONSAVEL",
        status="ATIVO",
        data_entrada=date.today(),
    ))

    for m in payload.membros:
        pessoa = Person(
            tenant_id=tenant_id,
            nome_civil=m.nome,
            busca=build_person_busca(m.nome, None),
            cpf=m.cpf,
            data_nascimento=m.data_nascimento,
        )
        db.add(pessoa)
        await db.flush()
        db.add(PersonFamilyMembership(
            tenant_id=tenant_id,
            person_id=pessoa.id,
            family_id=family.id,
            parentesco=m.parentesco,
            status="ATIVO",
            data_entrada=date.today(),
        ))

    await db.commit()
    return {
        "family_id": family.id,
        "codigo": family.codigo,
        "responsavel_id": responsavel.id,
        "total_membros": 1 + len(payload.membros),
    }


# ─── 3.3 ITINERANTES ──────────────────────────────────

@router.get("/persons/itinerantes", response_model=list[PersonOut])
async def listar_itinerantes(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    sub = (
        select(PersonFamilyMembership.person_id).where(
            PersonFamilyMembership.tenant_id == tenant_id,
            PersonFamilyMembership.status == "ATIVO",
        )
    )
    return (
        await db.execute(
            select(Person).where(
                Person.tenant_id == tenant_id,
                Person.deleted_at.is_(None),
                Person.is_itinerante == True,
                Person.id.notin_(sub),
            )
        )
    ).scalars().all()


@router.patch("/persons/{person_id}/itinerante", response_model=PersonOut)
async def marcar_itinerante(
    person_id: uuid.UUID,
    itinerante: bool = Query(),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    person = (
        await db.execute(
            select(Person).where(
                Person.id == person_id,
                Person.tenant_id == tenant_id,
                Person.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404)
    person.is_itinerante = itinerante
    await db.commit()
    await db.refresh(person)
    return person


# ─── 3.4 REATIVAÇÃO ──────────────────────────────────

@router.post("/persons/{person_id}/reativar", response_model=PersonOut)
async def reativar_pessoa(
    person_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    person = (
        await db.execute(
            select(Person).where(
                Person.id == person_id,
                Person.tenant_id == tenant_id,
                Person.deleted_at.isnot(None),
            )
        )
    ).scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa nao encontrada ou ja ativa")
    person.deleted_at = None
    await db.commit()
    await db.refresh(person)
    return person


# ─── 3.5 HISTÓRICO FAMILIAR UNIFICADO ────────────────

@router.get("/families/{family_id}/historico-vinculos")
async def historico_familiar(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    family = (
        await db.execute(
            select(Family).where(
                Family.id == family_id,
                Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not family:
        raise HTTPException(status_code=404)

    membros_atuais = (
        await db.execute(
            select(PersonFamilyMembership).where(
                PersonFamilyMembership.tenant_id == tenant_id,
                PersonFamilyMembership.family_id == family_id,
                PersonFamilyMembership.status == "ATIVO",
            )
        )
    ).scalars().all()

    historico = []
    for m in membros_atuais:
        vinculos_anteriores = (
            await db.execute(
                select(PersonFamilyMembership, Family).join(
                    Family, PersonFamilyMembership.family_id == Family.id,
                ).where(
                    PersonFamilyMembership.tenant_id == tenant_id,
                    PersonFamilyMembership.person_id == m.person_id,
                    PersonFamilyMembership.status != "ATIVO",
                ).order_by(PersonFamilyMembership.data_saida.desc())
            )
        ).all()

        for v, f in vinculos_anteriores:
            historico.append({
                "person_id": str(v.person_id),
                "family_id": str(v.family_id),
                "family_codigo": f.codigo,
                "family_responsavel_nome": "",  # poderia ser populado
                "parentesco": v.parentesco,
                "status": v.status,
                "data_entrada": str(v.data_entrada),
                "data_saida": str(v.data_saida) if v.data_saida else None,
                "motivo_saida": v.motivo_saida,
            })

    return {
        "family_atual": {
            "id": str(family.id),
            "codigo": family.codigo,
            "responsavel_id": str(family.responsavel_id) if family.responsavel_id else None,
        },
        "historico": historico,
    }
