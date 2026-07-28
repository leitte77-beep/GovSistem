import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import (
    get_client_info,
    get_tenant_id,
    require_roles,
)
from app.core.br_validators import mask_cpf
from app.core.database import get_db
from app.models.enums import AuditAccessType, AuditAction, RoleName
from app.models.professional import Professional
from app.models.professional_assignment import ProfessionalAssignment
from app.models.unit import Unit
from app.models.user import User
from app.schemas import (
    AssignmentCreate,
    AssignmentOut,
    AssignmentUpdate,
    ProfessionalCreate,
    ProfessionalListItem,
    ProfessionalOut,
    ProfessionalUpdate,
)
from app.services.audit import record_audit

router = APIRouter(prefix="/professionals", tags=["professionals"])

_READ = require_roles(
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)
_MANAGE = require_roles(
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)
_DELETE = require_roles(
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)


def _to_out(prof: Professional) -> dict:
    return {
        "id": prof.id,
        "nome": prof.nome,
        "cpf_mascarado": mask_cpf(prof.cpf),
        "funcao_nob_rh": prof.funcao_nob_rh,
        "conselho_classe_tipo": prof.conselho_classe_tipo,
        "conselho_classe_numero": prof.conselho_classe_numero,
        "email": prof.email,
        "telefone": prof.telefone,
        "user_id": prof.user_id,
        "is_active": prof.is_active,
        "assignments": prof.assignments,
        "created_at": prof.created_at,
        "updated_at": prof.updated_at,
    }


async def _get_owned(
    db: AsyncSession, tenant_id: uuid.UUID, prof_id: uuid.UUID
) -> Professional:
    prof = (
        await db.execute(
            select(Professional)
            .where(
                Professional.id == prof_id,
                Professional.tenant_id == tenant_id,
                Professional.deleted_at.is_(None),
            )
            .options(selectinload(Professional.assignments))
        )
    ).scalar_one_or_none()
    if not prof:
        raise HTTPException(status_code=404, detail="Profissional não encontrado")
    return prof


@router.get("", response_model=list[ProfessionalListItem])
async def listar_profissionais(
    search: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    query = select(Professional).where(
        Professional.tenant_id == tenant_id, Professional.deleted_at.is_(None)
    )
    if search:
        query = query.where(Professional.nome.ilike(f"%{search}%"))
    query = query.order_by(Professional.nome).offset(skip).limit(limit)
    result = await db.execute(query)
    return [
        {
            "id": p.id,
            "nome": p.nome,
            "cpf_mascarado": mask_cpf(p.cpf),
            "funcao_nob_rh": p.funcao_nob_rh,
            "is_active": p.is_active,
            "created_at": p.created_at,
        }
        for p in result.scalars().all()
    ]


@router.post("", response_model=ProfessionalOut, status_code=201)
async def criar_profissional(
    body: ProfessionalCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    exists = (
        await db.execute(
            select(Professional.id).where(
                Professional.tenant_id == tenant_id,
                Professional.cpf == body.cpf,
                Professional.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(
            status_code=409, detail="Já existe profissional com este CPF no tenant"
        )

    prof = Professional(tenant_id=tenant_id, **body.model_dump())
    db.add(prof)
    await db.flush()
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.CREATE,
        entity="professional",
        entity_id=prof.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"nome": prof.nome, "funcao_nob_rh": prof.funcao_nob_rh},
    )
    await db.commit()
    prof = await _get_owned(db, tenant_id, prof.id)
    return _to_out(prof)


@router.get("/{prof_id}", response_model=ProfessionalOut)
async def obter_profissional(
    prof_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    prof = await _get_owned(db, tenant_id, prof_id)
    # Leitura de registro sensível → auditada (READ_SENSIVEL).
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.READ,
        access_type=AuditAccessType.READ_SENSIVEL,
        entity="professional",
        entity_id=prof.id,
        actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()
    return _to_out(prof)


@router.patch("/{prof_id}", response_model=ProfessionalOut)
async def atualizar_profissional(
    prof_id: uuid.UUID,
    body: ProfessionalUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    prof = await _get_owned(db, tenant_id, prof_id)
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(prof, field, value)
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.UPDATE,
        entity="professional",
        entity_id=prof.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    prof = await _get_owned(db, tenant_id, prof.id)
    return _to_out(prof)


@router.delete("/{prof_id}", status_code=204)
async def excluir_profissional(
    prof_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_DELETE),
):
    prof = await _get_owned(db, tenant_id, prof_id)
    prof.deleted_at = datetime.now(timezone.utc)
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.DELETE,
        entity="professional",
        entity_id=prof.id,
        actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()
    return None


# ── Lotações ──────────────────────────────────────────────────────
@router.post("/{prof_id}/assignments", response_model=AssignmentOut, status_code=201)
async def criar_lotacao(
    prof_id: uuid.UUID,
    body: AssignmentCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    await _get_owned(db, tenant_id, prof_id)
    unit = (
        await db.execute(
            select(Unit.id).where(
                Unit.id == body.unit_id,
                Unit.tenant_id == tenant_id,
                Unit.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not unit:
        raise HTTPException(status_code=422, detail="Unidade inválida para o tenant")

    assignment = ProfessionalAssignment(
        tenant_id=tenant_id,
        professional_id=prof_id,
        unit_id=body.unit_id,
        funcao_no_local=body.funcao_no_local,
        data_inicio=body.data_inicio,
        data_fim=body.data_fim,
    )
    db.add(assignment)
    await db.flush()
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.CREATE,
        entity="professional_assignment",
        entity_id=assignment.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"professional_id": str(prof_id), "unit_id": str(body.unit_id)},
    )
    await db.commit()
    await db.refresh(assignment)
    return assignment


@router.patch(
    "/{prof_id}/assignments/{assignment_id}", response_model=AssignmentOut
)
async def atualizar_lotacao(
    prof_id: uuid.UUID,
    assignment_id: uuid.UUID,
    body: AssignmentUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    assignment = (
        await db.execute(
            select(ProfessionalAssignment).where(
                ProfessionalAssignment.id == assignment_id,
                ProfessionalAssignment.professional_id == prof_id,
                ProfessionalAssignment.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Lotação não encontrada")

    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(assignment, field, value)
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.UPDATE,
        entity="professional_assignment",
        entity_id=assignment.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    await db.refresh(assignment)
    return assignment
