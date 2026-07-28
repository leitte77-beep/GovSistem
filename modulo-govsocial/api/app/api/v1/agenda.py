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


# ============================================================================
# Cancelamento de agendamento (CCCXLI) + Horarios (CCCXXX-CCCXXXIV)
# ============================================================================

from app.models.agenda import AgendaBloqueio, AgendaHorario
from datetime import date as date_type
from pydantic import BaseModel as PydanticBase

class HorarioCreate(PydanticBase):
    professional_id: uuid.UUID | None = None
    unit_id: uuid.UUID | None = None
    equipe_id: uuid.UUID | None = None
    dia_semana: int
    hora_inicio: str
    hora_fim: str
    duracao_minutos: int = 30
    data_inicio: date_type
    data_fim: date_type | None = None

class BloqueioCreate(PydanticBase):
    professional_id: uuid.UUID | None = None
    unit_id: uuid.UUID | None = None
    data: date_type
    hora_inicio: str | None = None
    hora_fim: str | None = None
    motivo: str | None = None
    recorrente_anual: bool = False


@router.post("/appointments/{appointment_id}/cancel")
async def cancelar_agendamento(appointment_id: uuid.UUID, motivo: str = Query(..., min_length=3, max_length=200), request: Request = None, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    a = (await db.execute(select(Appointment).where(Appointment.id == appointment_id, Appointment.tenant_id == tenant_id, Appointment.deleted_at.is_(None)))).scalar_one_or_none()
    if not a: raise HTTPException(404, "Agendamento nao encontrado")
    if a.status not in ("AGENDADO", "AGUARDANDO"): raise HTTPException(400, "Agendamento nao pode ser cancelado")
    a.status = "CANCELADO"; a.motivo_cancelamento = motivo
    if request: await record_audit(db, tenant_id=tenant_id, action=AuditAction.UPDATE, entity="appointment", entity_id=a.id, actor=user, client_info=get_client_info(request))
    await db.commit()
    return a


@router.get("/schedule")
async def listar_horarios(db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_READ)):
    r = await db.execute(select(AgendaHorario).where(AgendaHorario.tenant_id == str(tenant_id), AgendaHorario.deleted_at.is_(None), AgendaHorario.ativo == True).order_by(AgendaHorario.dia_semana, AgendaHorario.hora_inicio))
    return [_horario_out(h) for h in r.scalars().all()]


@router.post("/schedule")
async def criar_horario(body: HorarioCreate, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    h = AgendaHorario(tenant_id=str(tenant_id), professional_id=body.professional_id, unit_id=body.unit_id, equipe_id=body.equipe_id, dia_semana=body.dia_semana, hora_inicio=body.hora_inicio, hora_fim=body.hora_fim, duracao_minutos=body.duracao_minutos, data_inicio=datetime.combine(body.data_inicio, datetime.min.time()))
    if body.data_fim: h.data_fim = datetime.combine(body.data_fim, datetime.min.time())
    db.add(h); await db.commit(); await db.refresh(h)
    return _horario_out(h)


@router.delete("/schedule/{horario_id}")
async def excluir_horario(horario_id: uuid.UUID, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    h = await db.get(AgendaHorario, horario_id)
    if not h or h.tenant_id != str(tenant_id): raise HTTPException(404, "Horario nao encontrado")
    h.deleted_at = datetime.now(timezone.utc); await db.commit()
    return {"ok": True}


@router.get("/blocks")
async def listar_bloqueios(unit_id: uuid.UUID | None = Query(None), db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_READ)):
    q = select(AgendaBloqueio).where(AgendaBloqueio.tenant_id == str(tenant_id), AgendaBloqueio.deleted_at.is_(None))
    if unit_id: q = q.where(AgendaBloqueio.unit_id == unit_id)
    r = await db.execute(q.order_by(AgendaBloqueio.data))
    return [_bloqueio_out(b) for b in r.scalars().all()]


@router.post("/blocks")
async def criar_bloqueio(body: BloqueioCreate, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    b = AgendaBloqueio(tenant_id=str(tenant_id), professional_id=body.professional_id, unit_id=body.unit_id, data=datetime.combine(body.data, datetime.min.time()), hora_inicio=body.hora_inicio, hora_fim=body.hora_fim, motivo=body.motivo, recorrente_anual=body.recorrente_anual)
    db.add(b); await db.commit(); await db.refresh(b)
    return _bloqueio_out(b)


@router.delete("/blocks/{bloqueio_id}")
async def excluir_bloqueio(bloqueio_id: uuid.UUID, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    b = await db.get(AgendaBloqueio, bloqueio_id)
    if not b or b.tenant_id != str(tenant_id): raise HTTPException(404, "Bloqueio nao encontrado")
    b.deleted_at = datetime.now(timezone.utc); await db.commit()
    return {"ok": True}


def _horario_out(h: AgendaHorario) -> dict:
    return {"id": str(h.id), "professional_id": str(h.professional_id) if h.professional_id else None, "unit_id": str(h.unit_id) if h.unit_id else None, "dia_semana": h.dia_semana, "hora_inicio": h.hora_inicio, "hora_fim": h.hora_fim, "duracao_minutos": h.duracao_minutos}

def _bloqueio_out(b: AgendaBloqueio) -> dict:
    return {"id": str(b.id), "professional_id": str(b.professional_id) if b.professional_id else None, "unit_id": str(b.unit_id) if b.unit_id else None, "data": b.data.strftime("%Y-%m-%d"), "hora_inicio": b.hora_inicio, "hora_fim": b.hora_fim, "motivo": b.motivo}
