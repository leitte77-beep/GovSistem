import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.models.acompanhamento import Acompanhamento
from app.models.attendance import Attendance
from app.models.case_file import CaseFile
from app.models.enums import (
    AuditAccessType,
    AuditAction,
    MotivoDesligamento,
    RoleName,
)
from app.models.family import Family
from app.models.unit import Unit
from app.models.user import User
from app.schemas.prontuario import (
    CaseFileCreate,
    CaseFileEncerrar,
    CaseFileListItem,
    CaseFileOut,
    CaseFileUpdate,
    NetworkViewItem,
)
from app.services.audit import record_audit
from app.services.scoping import can_access_unit, has_municipal_scope, user_unit_ids

router = APIRouter(prefix="/case-files", tags=["case-files"])

# Prontuário completo: técnico superior, coordenador, gestão (recepção NÃO).
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


async def _load(db, tenant_id, case_file_id) -> CaseFile:
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


def _to_out(cf: CaseFile) -> dict:
    return {
        "id": cf.id,
        "family_id": cf.family_id,
        "unit_id": cf.unit_id,
        "service_type_code": cf.service_type_code,
        "status": cf.status,
        "acolhida_data": cf.acolhida_data,
        "acolhida_access_form_code": cf.acolhida_access_form_code,
        "acolhida_motivo": cf.acolhida_motivo,
        "acolhida_profissional_id": cf.acolhida_profissional_id,
        "aberto_em": cf.aberto_em,
        "created_at": cf.created_at,
        "updated_at": cf.updated_at,
    }


async def _assert_unit_scope(db, tenant_id, user, unit_id):
    if not await can_access_unit(db, tenant_id, user, unit_id):
        raise HTTPException(
            status_code=403, detail="Usuário não lotado na unidade do prontuário"
        )


@router.get("", response_model=list[CaseFileListItem])
async def listar_prontuarios(
    family_id: uuid.UUID | None = Query(None),
    unit_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    query = select(CaseFile).where(
        CaseFile.tenant_id == tenant_id, CaseFile.deleted_at.is_(None)
    )
    if family_id:
        query = query.where(CaseFile.family_id == family_id)
    if unit_id:
        query = query.where(CaseFile.unit_id == unit_id)
    # Técnico sem escopo municipal: só as unidades onde está lotado.
    if not has_municipal_scope(user):
        unit_ids = await user_unit_ids(db, tenant_id, user)
        if not unit_ids:
            return []
        query = query.where(CaseFile.unit_id.in_(unit_ids))
    query = query.order_by(CaseFile.aberto_em.desc()).offset(skip).limit(limit)
    rows = (await db.execute(query)).scalars().all()
    return [
        {
            "id": cf.id,
            "family_id": cf.family_id,
            "unit_id": cf.unit_id,
            "service_type_code": cf.service_type_code,
            "status": cf.status,
            "acolhida_data": cf.acolhida_data,
            "aberto_em": cf.aberto_em,
            "created_at": cf.created_at,
        }
        for cf in rows
    ]


@router.post("", response_model=CaseFileOut, status_code=201)
async def criar_prontuario(
    body: CaseFileCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    await _assert_unit_scope(db, tenant_id, user, body.unit_id)

    fam = (
        await db.execute(
            select(Family.id).where(
                Family.id == body.family_id,
                Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not fam:
        raise HTTPException(status_code=422, detail="Família inválida para o tenant")
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

    dup = (
        await db.execute(
            select(CaseFile.id).where(
                CaseFile.tenant_id == tenant_id,
                CaseFile.family_id == body.family_id,
                CaseFile.unit_id == body.unit_id,
                CaseFile.service_type_code == body.service_type_code,
                CaseFile.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if dup:
        raise HTTPException(
            status_code=409,
            detail="Já existe prontuário desta família/unidade/serviço",
        )

    cf = CaseFile(
        tenant_id=tenant_id,
        family_id=body.family_id,
        unit_id=body.unit_id,
        service_type_code=body.service_type_code,
        acolhida_data=body.acolhida_data,
        acolhida_access_form_code=body.acolhida_access_form_code,
        acolhida_motivo=body.acolhida_motivo,
        acolhida_profissional_id=body.acolhida_profissional_id,
        aberto_em=datetime.now(timezone.utc),
    )
    db.add(cf)
    await db.flush()
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.CREATE,
        entity="case_file",
        entity_id=cf.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"service": cf.service_type_code, "unit": str(cf.unit_id)},
    )
    await db.commit()
    cf = await _load(db, tenant_id, cf.id)
    return _to_out(cf)


@router.get("/{case_file_id}", response_model=CaseFileOut)
async def obter_prontuario(
    case_file_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    cf = await _load(db, tenant_id, case_file_id)
    await _assert_unit_scope(db, tenant_id, user, cf.unit_id)
    # Abrir prontuário é leitura sensível → auditada.
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.READ,
        access_type=AuditAccessType.READ_SENSIVEL,
        entity="case_file",
        entity_id=cf.id,
        actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()
    return _to_out(cf)


@router.patch("/{case_file_id}", response_model=CaseFileOut)
async def atualizar_prontuario(
    case_file_id: uuid.UUID,
    body: CaseFileUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    cf = await _load(db, tenant_id, case_file_id)
    await _assert_unit_scope(db, tenant_id, user, cf.unit_id)
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(cf, field, value)
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.UPDATE,
        entity="case_file",
        entity_id=cf.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    cf = await _load(db, tenant_id, cf.id)
    return _to_out(cf)


@router.post("/{case_file_id}/encerrar", response_model=CaseFileOut)
async def encerrar_prontuario(
    case_file_id: uuid.UUID,
    body: CaseFileEncerrar,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    """Encerra o acompanhamento: arquiva o prontuário e encerra os
    acompanhamentos (PAIF/PAEFI/MSE) ativos vinculados, com motivo de
    desligamento e data de fim — mantendo o RMA consistente."""
    cf = await _load(db, tenant_id, case_file_id)
    await _assert_unit_scope(db, tenant_id, user, cf.unit_id)

    if cf.status != "ATIVO":
        raise HTTPException(status_code=409, detail="Prontuário já encerrado")

    motivos_validos = {m.value for m in MotivoDesligamento}
    if body.motivo_desligamento not in motivos_validos:
        raise HTTPException(
            status_code=422,
            detail=f"Motivo de desligamento inválido. Use um de: {sorted(motivos_validos)}",
        )

    data_fim = body.data_fim or datetime.now(timezone.utc).date()

    acs = (
        await db.execute(
            select(Acompanhamento).where(
                Acompanhamento.tenant_id == tenant_id,
                Acompanhamento.case_file_id == cf.id,
                Acompanhamento.situacao == "ATIVO",
                Acompanhamento.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    for ac in acs:
        ac.situacao = "ENCERRADO"
        ac.data_fim = data_fim
        ac.motivo_desligamento = body.motivo_desligamento
        if body.observacoes:
            ac.observacoes = (
                f"{ac.observacoes}\n{body.observacoes}" if ac.observacoes else body.observacoes
            )

    cf.status = "ARQUIVADO"

    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.UPDATE,
        entity="case_file",
        entity_id=cf.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={
            "status": "ARQUIVADO",
            "motivo_desligamento": body.motivo_desligamento,
            "data_fim": data_fim.isoformat(),
            "acompanhamentos_encerrados": len(acs),
        },
    )
    await db.commit()
    cf = await _load(db, tenant_id, cf.id)
    return _to_out(cf)


@router.get("/family/{family_id}/network", response_model=list[NetworkViewItem])
async def visao_de_rede(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    """Visão de rede: outras unidades veem QUE houve atendimento (unidade, data,
    serviço) SEM o conteúdo da evolução."""
    rows = (
        await db.execute(
            select(Attendance, Unit.nome)
            .join(Unit, Unit.id == Attendance.unit_id)
            .join(CaseFile, CaseFile.id == Attendance.case_file_id)
            .where(
                Attendance.tenant_id == tenant_id,
                Attendance.deleted_at.is_(None),
                CaseFile.family_id == family_id,
            )
            .order_by(Attendance.data_atendimento.desc())
        )
    ).all()
    return [
        {
            "unit_id": att.unit_id,
            "unit_nome": nome,
            "service_type_code": att.service_type_code,
            "data_atendimento": att.data_atendimento,
            "tipo": att.tipo,
        }
        for att, nome in rows
    ]
