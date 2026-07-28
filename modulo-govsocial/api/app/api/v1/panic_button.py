import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.user import User
from app.schemas.panic_button import (
    PanicButtonActivate,
    PanicButtonAttend,
    PanicButtonHistoryItem,
    PanicButtonListItem,
    PanicButtonOut,
    PanicButtonResolve,
)
from app.services import panic_button as pb

router = APIRouter(prefix="/panic-button", tags=["panic-button"])

_LEITURA = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)
_GESTAO = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.ADMIN.value,
)


@router.post("/activate", response_model=PanicButtonOut, status_code=201)
async def ativar_botao(
    body: PanicButtonActivate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _user: User = Depends(require_roles()),
):
    panic = await pb.activate(
        db,
        tenant_id=tenant_id,
        person_id=body.person_id,
        lat=body.lat,
        lng=body.lng,
        address=body.address,
        family_id=body.family_id,
    )
    await db.commit()
    return _out(panic)


@router.post("/{panic_id}/attend", response_model=PanicButtonOut)
async def atender_ocorrencia(
    panic_id: uuid.UUID,
    body: PanicButtonAttend | None = None,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_GESTAO),
):
    panic = await pb.attend(db, panic_id=panic_id, user_id=user.id)
    if not panic:
        raise HTTPException(status_code=404, detail="Ocorrência não encontrada ou já atendida")
    await db.commit()
    return _out(panic)


@router.post("/{panic_id}/resolve", response_model=PanicButtonOut)
async def resolver_ocorrencia(
    panic_id: uuid.UUID,
    body: PanicButtonResolve,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_GESTAO),
):
    panic = await pb.resolve(
        db,
        panic_id=panic_id,
        status=body.status,
        notes=body.notes,
        medida_protetiva_numero=body.medida_protetiva_numero,
        medida_protetiva_validade=(
            str(body.medida_protetiva_validade)
            if body.medida_protetiva_validade
            else None
        ),
    )
    if not panic:
        raise HTTPException(status_code=404, detail="Ocorrência não encontrada")
    await db.commit()
    return _out(panic)


@router.get("/active", response_model=list[PanicButtonListItem])
async def listar_ativos(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _user: User = Depends(_LEITURA),
):
    panics = await pb.list_active(db, tenant_id=tenant_id)
    return [
        PanicButtonListItem(
            id=p.id,
            person_id=p.person_id,
            activated_at=p.activated_at,
            location_lat=p.location_lat,
            location_lng=p.location_lng,
            location_address=p.location_address,
            status=p.status,
            attended_at=p.attended_at,
        )
        for p in panics
    ]


@router.get("/history", response_model=list[PanicButtonHistoryItem])
async def historico(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _user: User = Depends(_LEITURA),
):
    panics = await pb.list_history(db, tenant_id=tenant_id, limit=limit, offset=offset)
    return [
        PanicButtonHistoryItem(
            id=p.id,
            person_id=p.person_id,
            activated_at=p.activated_at,
            status=p.status,
            attended_by=p.attended_by,
            attended_at=p.attended_at,
            notes=p.notes,
            medida_protetiva_numero=p.medida_protetiva_numero,
            medida_protetiva_validade=p.medida_protetiva_validade,
            created_at=p.created_at,
        )
        for p in panics
    ]


def _out(p: pb.PanicButton) -> PanicButtonOut:
    return PanicButtonOut(
        id=p.id,
        tenant_id=p.tenant_id,
        person_id=p.person_id,
        family_id=p.family_id,
        activated_at=p.activated_at,
        location_lat=p.location_lat,
        location_lng=p.location_lng,
        location_address=p.location_address,
        status=p.status,
        attended_by=p.attended_by,
        attended_at=p.attended_at,
        notes=p.notes,
        medida_protetiva_numero=p.medida_protetiva_numero,
        medida_protetiva_validade=p.medida_protetiva_validade,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )
