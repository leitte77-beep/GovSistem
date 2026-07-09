import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import AuditAction, RoleName
from app.models.reception_log import ReceptionLog
from app.models.unit import Unit
from app.models.user import User
from app.schemas.prontuario import ReceptionCreate, ReceptionOut, ReceptionUpdate
from app.services.audit import record_audit

# Recepção/triagem NÃO é atendimento (regra do RMA) — recurso separado.
router = APIRouter(prefix="/reception", tags=["reception"])

_MANAGE = require_roles(
    RoleName.RECEPCAO.value,
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)


def _to_out(r: ReceptionLog) -> dict:
    return {
        "id": r.id,
        "unit_id": r.unit_id,
        "data": r.data,
        "person_id": r.person_id,
        "family_id": r.family_id,
        "nome_informado": r.nome_informado,
        "motivo": r.motivo,
        "status": r.status,
        "senha": r.senha,
        "atendido_em": r.atendido_em,
        "created_at": r.created_at,
    }


@router.get("", response_model=list[ReceptionOut])
async def fila_do_dia(
    unit_id: uuid.UUID = Query(...),
    status: str | None = Query(None),
    somente_hoje: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    query = select(ReceptionLog).where(
        ReceptionLog.tenant_id == tenant_id, ReceptionLog.unit_id == unit_id
    )
    if status:
        query = query.where(ReceptionLog.status == status)
    if somente_hoje:
        start = datetime.combine(date.today(), datetime.min.time(), tzinfo=timezone.utc)
        query = query.where(ReceptionLog.data >= start)
    query = query.order_by(ReceptionLog.data)
    rows = (await db.execute(query)).scalars().all()
    return [_to_out(r) for r in rows]


@router.post("", response_model=ReceptionOut, status_code=201)
async def registrar_recepcao(
    body: ReceptionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
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

    r = ReceptionLog(
        tenant_id=tenant_id,
        unit_id=body.unit_id,
        data=datetime.now(timezone.utc),
        person_id=body.person_id,
        family_id=body.family_id,
        nome_informado=body.nome_informado,
        motivo=body.motivo,
        senha=body.senha,
        status="AGUARDANDO",
    )
    db.add(r)
    await db.flush()
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.CREATE,
        entity="reception_log",
        entity_id=r.id,
        actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()
    await db.refresh(r)
    return _to_out(r)


@router.patch("/{reception_id}", response_model=ReceptionOut)
async def atualizar_recepcao(
    reception_id: uuid.UUID,
    body: ReceptionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    r = (
        await db.execute(
            select(ReceptionLog).where(
                ReceptionLog.id == reception_id,
                ReceptionLog.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Registro de recepção não encontrado")

    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(r, field, value)
    if changes.get("status") in {"ATENDIDO", "ENCAMINHADO"} and r.atendido_em is None:
        r.atendido_em = datetime.now(timezone.utc)

    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.UPDATE,
        entity="reception_log",
        entity_id=r.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    await db.refresh(r)
    return _to_out(r)
