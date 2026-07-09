import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.core.encryption import decrypt_text, encrypt_text
from app.models.attendance import (
    Attendance,
    AttendanceMember,
    AttendanceProfessional,
)
from app.models.case_file import CaseFile
from app.models.enums import AuditAccessType, AuditAction, RoleName
from app.models.person import Person
from app.models.professional import Professional
from app.models.user import User
from app.schemas.prontuario import (
    AttendanceCreate,
    AttendanceOut,
    AttendanceUpdate,
    TimelineItem,
)
from app.services.audit import record_audit
from app.services.scoping import can_access_unit, can_read_evolution

router = APIRouter(prefix="/case-files/{case_file_id}", tags=["attendances"])

_READ = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)
_MANAGE = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.ADMIN.value,
)


async def _load_case_file(db, tenant_id, case_file_id) -> CaseFile:
    cf = (
        await db.execute(
            select(CaseFile).where(
                CaseFile.id == case_file_id,
                CaseFile.tenant_id == tenant_id,
                CaseFile.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not cf:
        raise HTTPException(status_code=404, detail="Prontuário não encontrado")
    return cf


async def _load_attendance(db, tenant_id, case_file_id, attendance_id) -> Attendance:
    att = (
        await db.execute(
            select(Attendance).where(
                Attendance.id == attendance_id,
                Attendance.case_file_id == case_file_id,
                Attendance.tenant_id == tenant_id,
                Attendance.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not att:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado")
    return att


async def _validate_members(db, tenant_id, family_id, member_ids):
    for pid in member_ids:
        ok = (
            await db.execute(
                select(Person.id).where(
                    Person.id == pid,
                    Person.tenant_id == tenant_id,
                    Person.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if not ok:
            raise HTTPException(status_code=422, detail=f"Pessoa inválida: {pid}")


async def _validate_professionals(db, tenant_id, professional_ids):
    for pid in professional_ids:
        ok = (
            await db.execute(
                select(Professional.id).where(
                    Professional.id == pid,
                    Professional.tenant_id == tenant_id,
                    Professional.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if not ok:
            raise HTTPException(status_code=422, detail=f"Profissional inválido: {pid}")


async def _to_out(db, tenant_id, user, att: Attendance, *, include_evolution: bool) -> dict:
    member_ids = [m.person_id for m in att.members]
    professional_ids = [p.professional_id for p in att.professionals]
    can_read = False
    evolution = None
    if include_evolution:
        can_read = await can_read_evolution(
            db,
            tenant_id,
            user,
            attendance_unit_id=att.unit_id,
            sigiloso_reforcado=att.sigiloso_reforcado,
            registrado_por_user_id=att.registrado_por_user_id,
        )
        if can_read:
            evolution = decrypt_text(att.evolution_text_enc)
    return {
        "id": att.id,
        "case_file_id": att.case_file_id,
        "unit_id": att.unit_id,
        "service_type_code": att.service_type_code,
        "data_atendimento": att.data_atendimento,
        "tipo": att.tipo,
        "sigiloso_reforcado": att.sigiloso_reforcado,
        "registrado_por_id": att.registrado_por_id,
        "member_ids": member_ids,
        "professional_ids": professional_ids,
        "evolution_text": evolution,
        "evolution_restrita": include_evolution and not can_read,
        "created_at": att.created_at,
        "updated_at": att.updated_at,
    }


@router.get("/attendances", response_model=list[AttendanceOut])
async def listar_atendimentos(
    case_file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    rows = (
        await db.execute(
            select(Attendance)
            .where(
                Attendance.tenant_id == tenant_id,
                Attendance.case_file_id == case_file_id,
                Attendance.deleted_at.is_(None),
            )
            .order_by(Attendance.data_atendimento.desc())
        )
    ).scalars().all()
    return [
        await _to_out(db, tenant_id, user, att, include_evolution=False)
        for att in rows
    ]


@router.get("/timeline", response_model=list[TimelineItem])
async def linha_do_tempo(
    case_file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    rows = (
        await db.execute(
            select(Attendance)
            .where(
                Attendance.tenant_id == tenant_id,
                Attendance.case_file_id == case_file_id,
                Attendance.deleted_at.is_(None),
            )
            .order_by(Attendance.data_atendimento.desc())
        )
    ).scalars().all()
    out = []
    for att in rows:
        pode = await can_read_evolution(
            db, tenant_id, user,
            attendance_unit_id=att.unit_id,
            sigiloso_reforcado=att.sigiloso_reforcado,
            registrado_por_user_id=att.registrado_por_user_id,
        )
        out.append({
            "attendance_id": att.id,
            "data_atendimento": att.data_atendimento,
            "tipo": att.tipo,
            "service_type_code": att.service_type_code,
            "unit_id": att.unit_id,
            "sigiloso_reforcado": att.sigiloso_reforcado,
            "pode_ler_evolucao": pode,
        })
    return out


@router.post("/attendances", response_model=AttendanceOut, status_code=201)
async def criar_atendimento(
    case_file_id: uuid.UUID,
    body: AttendanceCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    await _validate_members(db, tenant_id, cf.family_id, body.member_ids)
    await _validate_professionals(db, tenant_id, body.professional_ids)

    att = Attendance(
        tenant_id=tenant_id,
        case_file_id=cf.id,
        unit_id=cf.unit_id,
        service_type_code=cf.service_type_code,
        data_atendimento=body.data_atendimento,
        tipo=body.tipo,
        evolution_text_enc=encrypt_text(body.evolution_text),
        sigiloso_reforcado=body.sigiloso_reforcado,
        registrado_por_id=body.registrado_por_id,
        registrado_por_user_id=user.id,
    )
    db.add(att)
    await db.flush()
    for pid in body.member_ids:
        db.add(AttendanceMember(tenant_id=tenant_id, attendance_id=att.id, person_id=pid))
    for pid in body.professional_ids:
        db.add(AttendanceProfessional(
            tenant_id=tenant_id, attendance_id=att.id, professional_id=pid
        ))

    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.CREATE,
        entity="attendance",
        entity_id=att.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"tipo": att.tipo, "sigiloso": att.sigiloso_reforcado},
    )
    await db.commit()
    att = await _load_attendance(db, tenant_id, case_file_id, att.id)
    return await _to_out(db, tenant_id, user, att, include_evolution=True)


@router.get("/attendances/{attendance_id}", response_model=AttendanceOut)
async def obter_atendimento(
    case_file_id: uuid.UUID,
    attendance_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    att = await _load_attendance(db, tenant_id, case_file_id, attendance_id)
    if not await can_access_unit(db, tenant_id, user, att.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    out = await _to_out(db, tenant_id, user, att, include_evolution=True)
    # Leitura da evolução (quando concedida) é auditada como READ_SENSIVEL.
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.READ,
        access_type=AuditAccessType.READ_SENSIVEL,
        entity="attendance",
        entity_id=att.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"evolucao_lida": not out["evolution_restrita"]},
    )
    await db.commit()
    return out


@router.patch("/attendances/{attendance_id}", response_model=AttendanceOut)
async def atualizar_atendimento(
    case_file_id: uuid.UUID,
    attendance_id: uuid.UUID,
    body: AttendanceUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    att = await _load_attendance(db, tenant_id, case_file_id, attendance_id)
    if not await can_access_unit(db, tenant_id, user, att.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    changes = body.model_dump(exclude_unset=True)

    if "evolution_text" in changes:
        att.evolution_text_enc = encrypt_text(changes.pop("evolution_text"))
    member_ids = changes.pop("member_ids", None)
    professional_ids = changes.pop("professional_ids", None)
    for field, value in changes.items():
        setattr(att, field, value)

    if member_ids is not None:
        await _validate_members(db, tenant_id, att.case_file_id, member_ids)
        for m in list(att.members):
            await db.delete(m)
        await db.flush()
        for pid in member_ids:
            db.add(AttendanceMember(tenant_id=tenant_id, attendance_id=att.id, person_id=pid))
    if professional_ids is not None:
        await _validate_professionals(db, tenant_id, professional_ids)
        for p in list(att.professionals):
            await db.delete(p)
        await db.flush()
        for pid in professional_ids:
            db.add(AttendanceProfessional(
                tenant_id=tenant_id, attendance_id=att.id, professional_id=pid
            ))

    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.UPDATE,
        entity="attendance",
        entity_id=att.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(body.model_dump(exclude_unset=True).keys())},
    )
    await db.commit()
    att = await _load_attendance(db, tenant_id, case_file_id, att.id)
    return await _to_out(db, tenant_id, user, att, include_evolution=True)


@router.delete("/attendances/{attendance_id}", status_code=204)
async def excluir_atendimento(
    case_file_id: uuid.UUID,
    attendance_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    att = await _load_attendance(db, tenant_id, case_file_id, attendance_id)
    if not await can_access_unit(db, tenant_id, user, att.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    att.deleted_at = datetime.now(timezone.utc)
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.DELETE,
        entity="attendance",
        entity_id=att.id,
        actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()
    return None


@router.get("/pdf")
async def prontuario_pdf(
    case_file_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    """Gera o PDF do prontuário no padrão do Prontuário SUAS físico."""
    from app.services.prontuario_pdf import generate_case_file_pdf

    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")

    pdf_bytes = await generate_case_file_pdf(db, tenant_id, user, cf.id)

    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.READ,
        access_type=AuditAccessType.READ_SENSIVEL,
        entity="case_file_pdf",
        entity_id=cf.id,
        actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()

    filename = f"prontuario_{cf.service_type_code}_{cf.id.hex[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
