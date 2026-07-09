import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.models.agenda import Appointment, VisitaDomiciliar
from app.models.enums import AuditAction, RoleName
from app.models.user import User
from app.schemas.agenda import (
    AppointmentCreate,
    AppointmentOut,
    AppointmentUpdate,
    SenhaChamada,
    VisitaCreate,
    VisitaOut,
    VisitaUpdate,
)
from app.services.audit import record_audit

router = APIRouter(tags=["agenda"])

_READ = require_roles(
    RoleName.RECEPCAO.value,
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.TECNICO_MEDIO.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)
_MANAGE = require_roles(
    RoleName.RECEPCAO.value,
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.ADMIN.value,
)

_SENHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"  # letras maiúsculas sequenciais


# ═══════════════════════════════════════════════════════════════════════
# Appointments
# ═══════════════════════════════════════════════════════════════════════

@router.get("/appointments", response_model=list[AppointmentOut])
async def listar_agenda(
    unit_id: uuid.UUID | None = Query(None),
    professional_id: uuid.UUID | None = Query(None),
    data: date | None = Query(None, description="Filtrar por data"),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = select(Appointment).where(
        Appointment.tenant_id == tenant_id,
        Appointment.deleted_at.is_(None),
    )
    if unit_id:
        q = q.where(Appointment.unit_id == unit_id)
    if professional_id:
        q = q.where(Appointment.professional_id == professional_id)
    if data:
        start = datetime(data.year, data.month, data.day, tzinfo=timezone.utc)
        end = datetime(data.year, data.month, data.day, 23, 59, 59, tzinfo=timezone.utc)
        q = q.where(Appointment.data_hora_inicio.between(start, end))
    if status:
        q = q.where(Appointment.status == status)
    q = q.order_by(Appointment.data_hora_inicio)
    rows = (await db.execute(q)).scalars().all()
    return rows


@router.post("/appointments", response_model=AppointmentOut, status_code=201)
async def criar_agendamento(
    body: AppointmentCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    # Gerar senha sequencial para o dia/unidade
    hoje = body.data_hora_inicio.date()
    dia_start = datetime(hoje.year, hoje.month, hoje.day, tzinfo=timezone.utc)
    dia_end = datetime(hoje.year, hoje.month, hoje.day, 23, 59, 59, tzinfo=timezone.utc)
    count = (
        await db.execute(
            select(Appointment).where(
                Appointment.tenant_id == tenant_id,
                Appointment.unit_id == body.unit_id,
                Appointment.deleted_at.is_(None),
            ).where(
                Appointment.data_hora_inicio >= dia_start,
                Appointment.data_hora_inicio <= dia_end,
            )
        )
    ).scalars().all()
    idx = len(count)
    letra = _SENHA[idx % len(_SENHA)]
    sufixo = idx // len(_SENHA) + 1 if idx >= len(_SENHA) else ""
    senha = f"{letra}{sufixo}"

    a = Appointment(
        tenant_id=tenant_id,
        unit_id=body.unit_id,
        professional_id=body.professional_id,
        person_id=body.person_id,
        family_id=body.family_id,
        tipo=body.tipo,
        data_hora_inicio=body.data_hora_inicio,
        data_hora_fim=body.data_hora_fim,
        observacoes=body.observacoes,
        senha=senha,
        opt_in_lembrete=body.opt_in_lembrete,
    )
    db.add(a)
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="appointment", entity_id=a.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"tipo": a.tipo, "senha": senha, "unidade": str(a.unit_id)},
    )
    await db.commit()
    a = (await db.execute(select(Appointment).where(Appointment.id == a.id))).scalar_one()
    return a


@router.patch("/appointments/{appt_id}", response_model=AppointmentOut)
async def atualizar_agendamento(
    appt_id: uuid.UUID,
    body: AppointmentUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    a = (
        await db.execute(select(Appointment).where(
            Appointment.id == appt_id, Appointment.tenant_id == tenant_id,
            Appointment.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    changes = body.model_dump(exclude_unset=True)
    for f, v in changes.items():
        setattr(a, f, v)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="appointment", entity_id=a.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    a = (await db.execute(select(Appointment).where(Appointment.id == a.id))).scalar_one()
    return a


@router.get("/appointments/daily-queue", response_model=list[AppointmentOut])
async def fila_do_dia(
    unit_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    hoje = date.today()
    start = datetime(hoje.year, hoje.month, hoje.day, tzinfo=timezone.utc)
    end = datetime(hoje.year, hoje.month, hoje.day, 23, 59, 59, tzinfo=timezone.utc)
    rows = (
        await db.execute(
            select(Appointment).where(
                Appointment.tenant_id == tenant_id,
                Appointment.unit_id == unit_id,
                Appointment.data_hora_inicio.between(start, end),
                Appointment.status.in_(["AGENDADO", "AGUARDANDO"]),
                Appointment.deleted_at.is_(None),
            ).order_by(Appointment.senha)
        )
    ).scalars().all()
    return rows


@router.post("/appointments/{appt_id}/call", response_model=AppointmentOut)
async def chamar_proximo(
    appt_id: uuid.UUID,
    body: SenhaChamada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    a = (
        await db.execute(select(Appointment).where(
            Appointment.id == appt_id, Appointment.tenant_id == tenant_id,
            Appointment.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    a.status = "EM_ATENDIMENTO"
    a.professional_id = body.professional_id
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="appointment", entity_id=a.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"chamado_por": str(body.professional_id)},
    )
    await db.commit()
    a = (await db.execute(select(Appointment).where(Appointment.id == a.id))).scalar_one()
    return a


# ═══════════════════════════════════════════════════════════════════════
# Visitas Domiciliares
# ═══════════════════════════════════════════════════════════════════════

@router.get("/home-visits", response_model=list[VisitaOut])
async def listar_visitas(
    family_id: uuid.UUID | None = Query(None),
    professional_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = select(VisitaDomiciliar).where(
        VisitaDomiciliar.tenant_id == tenant_id,
        VisitaDomiciliar.deleted_at.is_(None),
    )
    if family_id:
        q = q.where(VisitaDomiciliar.family_id == family_id)
    if professional_id:
        q = q.where(VisitaDomiciliar.professional_id == professional_id)
    if status:
        q = q.where(VisitaDomiciliar.status == status)
    q = q.order_by(VisitaDomiciliar.data_planejada.desc())
    return (await db.execute(q)).scalars().all()


@router.post("/home-visits", response_model=VisitaOut, status_code=201)
async def planejar_visita(
    body: VisitaCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    v = VisitaDomiciliar(
        tenant_id=tenant_id,
        family_id=body.family_id,
        unit_id=body.unit_id,
        professional_id=body.professional_id,
        data_planejada=body.data_planejada,
        observacoes=body.observacoes,
        status="PLANEJADA",
    )
    db.add(v)
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="visita_domiciliar", entity_id=v.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"familia": str(body.family_id)},
    )
    await db.commit()
    v = (
        await db.execute(select(VisitaDomiciliar).where(VisitaDomiciliar.id == v.id))
    ).scalar_one()
    return v


@router.patch("/home-visits/{visita_id}", response_model=VisitaOut)
async def atualizar_visita(
    visita_id: uuid.UUID,
    body: VisitaUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    v = (
        await db.execute(select(VisitaDomiciliar).where(
            VisitaDomiciliar.id == visita_id,
            VisitaDomiciliar.tenant_id == tenant_id,
            VisitaDomiciliar.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=404, detail="Visita não encontrada")
    changes = body.model_dump(exclude_unset=True)
    if changes.get("status") == "REALIZADA" and not changes.get("data_realizada"):
        changes["data_realizada"] = datetime.now(timezone.utc)
    for f, vv in changes.items():
        setattr(v, f, vv)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="visita_domiciliar", entity_id=v.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    v = (
        await db.execute(select(VisitaDomiciliar).where(VisitaDomiciliar.id == v.id))
    ).scalar_one()
    return v
