"""Endpoints do modulo habitacional."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.family import Family
from app.models.habitacional import (
    AtividadeHabitacional,
    DemandaHabitacional,
    DocumentoHabitacional,
    ProgramaHabitacional,
)
from app.models.user import User

from pydantic import BaseModel

router = APIRouter(tags=["habitacional"])

_MANAGE = require_roles(
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)
_READ = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)


class ProgramaCreate(BaseModel):
    nome: str
    esfera: str
    descricao: str | None = None
    criterios: dict | None = None
    condicoes_financiamento: dict | None = None
    data_inicio: date | None = None
    data_fim: date | None = None


class DemandaCreate(BaseModel):
    family_id: uuid.UUID
    programa_id: uuid.UUID | None = None
    tipo_demanda: str
    data_cadastro: date
    observacoes: str | None = None


class DemandaUpdate(BaseModel):
    status: str | None = None
    pontuacao: float | None = None
    programa_id: uuid.UUID | None = None
    observacoes: str | None = None


class AtividadeCreate(BaseModel):
    programa_id: uuid.UUID | None = None
    nome: str
    descricao: str | None = None
    tipo: str
    data_inicio: date
    data_fim: date | None = None
    local: str | None = None


# ─── PROGRAMAS ────────────────────────────────────────

@router.get("/programas-habitacionais")
async def listar_programas(
    esfera: str | None = Query(None),
    ativo: bool = True,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = select(ProgramaHabitacional).where(
        ProgramaHabitacional.tenant_id == tenant_id,
        ProgramaHabitacional.ativo == ativo,
    )
    if esfera:
        q = q.where(ProgramaHabitacional.esfera == esfera)
    return (await db.execute(q)).scalars().all()


@router.post("/programas-habitacionais")
async def criar_programa(
    payload: ProgramaCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    p = ProgramaHabitacional(tenant_id=tenant_id, **payload.model_dump())
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


@router.delete("/programas-habitacionais/{prog_id}", status_code=204)
async def desativar_programa(
    prog_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    p = (
        await db.execute(
            select(ProgramaHabitacional).where(
                ProgramaHabitacional.id == prog_id,
                ProgramaHabitacional.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404)
    p.ativo = False
    await db.commit()


# ─── DEMANDAS ─────────────────────────────────────────

@router.get("/demandas-habitacionais")
async def listar_demandas(
    family_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
    programa_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = (
        select(DemandaHabitacional).where(
            DemandaHabitacional.tenant_id == tenant_id,
        ).options(
            selectinload(DemandaHabitacional.family).selectinload(Family.responsavel),
            selectinload(DemandaHabitacional.programa),
        )
    )
    if family_id:
        q = q.where(DemandaHabitacional.family_id == family_id)
    if status:
        q = q.where(DemandaHabitacional.status == status)
    if programa_id:
        q = q.where(DemandaHabitacional.programa_id == programa_id)

    result = await db.execute(q.order_by(DemandaHabitacional.data_cadastro.desc()))
    return result.unique().scalars().all()


@router.post("/demandas-habitacionais")
async def criar_demanda(
    payload: DemandaCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    d = DemandaHabitacional(tenant_id=tenant_id, **payload.model_dump())
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return d


@router.patch("/demandas-habitacionais/{demanda_id}")
async def atualizar_demanda(
    demanda_id: uuid.UUID,
    payload: DemandaUpdate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    d = (
        await db.execute(
            select(DemandaHabitacional).where(
                DemandaHabitacional.id == demanda_id,
                DemandaHabitacional.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    await db.commit()
    await db.refresh(d)
    return d


# ─── CLASSIFICAÇÃO ────────────────────────────────────

@router.get("/demandas-habitacionais/classificacao")
async def classificar_demandas(
    programa_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    """Classifica demandas por criterios do programa (renda, membros, idosos, deficientes, mulher chefe)."""
    programa = None
    criterios = {}

    if programa_id:
        programa = (
            await db.execute(
                select(ProgramaHabitacional).where(
                    ProgramaHabitacional.id == programa_id,
                    ProgramaHabitacional.tenant_id == tenant_id,
                )
            )
        ).scalar_one_or_none()
        if programa and programa.criterios:
            criterios = programa.criterios

    demandas = (
        await db.execute(
            select(DemandaHabitacional).where(
                DemandaHabitacional.tenant_id == tenant_id,
                DemandaHabitacional.status == "CADASTRADA",
            ).options(
                selectinload(DemandaHabitacional.family).selectinload(Family.memberships).selectinload("person"),
            )
        )
    ).scalars().all()

    classificadas = []
    for d in demandas:
        pontos = 0.0
        family = d.family
        if family:
            members = [m for m in family.memberships if m.status == "ATIVO"]
            total = len(members)
            # Critérios básicos
            pontos += total * 2
            for m in members:
                if m.person and m.person.data_nascimento:
                    idade = (date.today() - m.person.data_nascimento).days // 365
                    if idade >= 60:
                        pontos += 10  # idoso
                    elif idade <= 18:
                        pontos += 5   # criança/adolescente
                if m.person and m.person.tipo_deficiencia and m.person.tipo_deficiencia != "NENHUMA":
                    pontos += 10
            # Responsável mulher
            if family.responsavel and family.responsavel.sexo == "FEMININO":
                pontos += 8
            # Tempo no município
            pontos += 5

        classificadas.append({
            "demanda_id": str(d.id),
            "familia_codigo": family.codigo if family else 0,
            "responsavel": family.responsavel.nome_exibicao if family and family.responsavel else "",
            "tipo_demanda": d.tipo_demanda,
            "total_membros": len([m for m in (family.memberships or []) if m.status == "ATIVO"]) if family else 0,
            "pontuacao": pontos,
            "status": d.status,
        })

    classificadas.sort(key=lambda x: x["pontuacao"], reverse=True)

    for i, item in enumerate(classificadas):
        item["posicao"] = i + 1

    return classificadas


# ─── ATIVIDADES ──────────────────────────────────────

@router.get("/atividades-habitacionais")
async def listar_atividades(
    programa_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = select(AtividadeHabitacional).where(
        AtividadeHabitacional.tenant_id == tenant_id,
    )
    if programa_id:
        q = q.where(AtividadeHabitacional.programa_id == programa_id)
    return (await db.execute(q.order_by(AtividadeHabitacional.data_inicio.desc()))).scalars().all()


@router.post("/atividades-habitacionais")
async def criar_atividade(
    payload: AtividadeCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    a = AtividadeHabitacional(tenant_id=tenant_id, **payload.model_dump())
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return a
