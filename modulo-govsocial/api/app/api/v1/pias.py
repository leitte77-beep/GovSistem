import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.core.encryption import decrypt_text, encrypt_text
from app.models.acompanhamento import Acompanhamento
from app.models.case_file import CaseFile
from app.models.enums import AuditAction, RoleName
from app.models.pia import Pia, RelatorioPia
from app.models.user import User
from app.schemas.acompanhamento import (
    PiaCreate,
    PiaOut,
    PiaUpdate,
    RelatorioPiaCreate,
    RelatorioPiaOut,
)
from app.services.audit import record_audit
from app.services.scoping import can_access_unit

router = APIRouter(prefix="/case-files/{case_file_id}", tags=["pias"])

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


def _pia_out(p: Pia) -> dict:
    dfm = p.data_inicio_medida.isoformat() if p.data_inicio_medida else None
    dfme = p.data_fim_medida.isoformat() if p.data_fim_medida else None
    prj = p.proximo_relatorio_judiciario.isoformat() if p.proximo_relatorio_judiciario else None
    return {
        "id": str(p.id),
        "case_file_id": str(p.case_file_id),
        "acompanhamento_id": str(p.acompanhamento_id) if p.acompanhamento_id else None,
        "numero_processo": p.numero_processo,
        "vara": p.vara,
        "comarca": p.comarca,
        "medida_socioeducativa": p.medida_socioeducativa,
        "prazo_medida": p.prazo_medida,
        "data_inicio_medida": dfm,
        "data_fim_medida": dfme,
        "frequencia_cumprimento": p.frequencia_cumprimento,
        "dias_cumprimento": p.dias_cumprimento,
        "objetivos": p.objetivos,
        "acoes": p.acoes,
        "proximo_relatorio_judiciario": prj,
        "created_at": p.created_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
    }


def _r_out(r: RelatorioPia) -> dict:
    return {
        "id": str(r.id),
        "pia_id": str(r.pia_id),
        "data_relatorio": r.data_relatorio.isoformat(),
        "tipo": r.tipo,
        "elaborado_por_id": str(r.elaborado_por_id) if r.elaborado_por_id else None,
        "texto": decrypt_text(r.texto_enc) if r.texto_enc else None,
        "texto_restrito": False,
        "created_at": r.created_at.isoformat(),
    }


@router.get("/pia", response_model=list[PiaOut])
async def listar_pias(
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
            select(Pia).where(
                Pia.tenant_id == tenant_id, Pia.case_file_id == case_file_id,
            ).order_by(Pia.created_at.desc())
        )
    ).scalars().all()
    return [_pia_out(r) for r in rows]


@router.get("/pia/{pia_id}", response_model=PiaOut)
async def obter_pia(
    case_file_id: uuid.UUID,
    pia_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    pia = (
        await db.execute(
            select(Pia).where(
                Pia.id == pia_id, Pia.case_file_id == case_file_id,
                Pia.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not pia:
        raise HTTPException(status_code=404, detail="PIA não encontrado")
    return _pia_out(pia)


@router.post("/pia", response_model=PiaOut, status_code=201)
async def criar_pia(
    case_file_id: uuid.UUID,
    body: PiaCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    if body.acompanhamento_id:
        ac = (
            await db.execute(
                select(Acompanhamento.id).where(
                    Acompanhamento.id == body.acompanhamento_id,
                    Acompanhamento.tenant_id == tenant_id,
                    Acompanhamento.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if not ac:
            raise HTTPException(status_code=422, detail="Acompanhamento inválido")

    pia = Pia(tenant_id=tenant_id, case_file_id=case_file_id, **body.model_dump())
    db.add(pia)
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="pia", entity_id=pia.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"medida": pia.medida_socioeducativa, "processo": pia.numero_processo},
    )
    await db.commit()
    pia = (await db.execute(select(Pia).where(Pia.id == pia.id))).scalar_one()
    return _pia_out(pia)


@router.patch("/pia/{pia_id}", response_model=PiaOut)
async def atualizar_pia(
    case_file_id: uuid.UUID,
    pia_id: uuid.UUID,
    body: PiaUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    pia = (
        await db.execute(
            select(Pia).where(
                Pia.id == pia_id, Pia.case_file_id == case_file_id,
                Pia.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not pia:
        raise HTTPException(status_code=404, detail="PIA não encontrado")
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(pia, field, value)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="pia", entity_id=pia.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    pia = (await db.execute(select(Pia).where(Pia.id == pia.id))).scalar_one()
    return _pia_out(pia)


@router.get("/pia/{pia_id}/reports", response_model=list[RelatorioPiaOut])
async def listar_relatorios(
    case_file_id: uuid.UUID,
    pia_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    ok = (
        await db.execute(
            select(Pia.id).where(Pia.id == pia_id, Pia.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not ok:
        raise HTTPException(status_code=404, detail="PIA não encontrado")
    rows = (
        await db.execute(
            select(RelatorioPia).where(
                RelatorioPia.pia_id == pia_id, RelatorioPia.tenant_id == tenant_id,
            ).order_by(RelatorioPia.data_relatorio.desc())
        )
    ).scalars().all()
    return [_r_out(r) for r in rows]


@router.post("/pia/{pia_id}/reports", response_model=RelatorioPiaOut, status_code=201)
async def criar_relatorio(
    case_file_id: uuid.UUID,
    pia_id: uuid.UUID,
    body: RelatorioPiaCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    cf = await _load_case_file(db, tenant_id, case_file_id)
    if not await can_access_unit(db, tenant_id, user, cf.unit_id):
        raise HTTPException(status_code=403, detail="Sem acesso à unidade")
    ok = (
        await db.execute(
            select(Pia.id).where(Pia.id == pia_id, Pia.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not ok:
        raise HTTPException(status_code=404, detail="PIA não encontrado")

    rel = RelatorioPia(
        tenant_id=tenant_id, pia_id=pia_id,
        data_relatorio=body.data_relatorio, tipo=body.tipo,
        elaborado_por_id=body.elaborado_por_id,
        texto_enc=encrypt_text(body.texto) if body.texto else None,
    )
    db.add(rel)
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="relatorio_pia", entity_id=rel.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"tipo": rel.tipo},
    )
    await db.commit()
    rel = (await db.execute(select(RelatorioPia).where(RelatorioPia.id == rel.id))).scalar_one()
    return _r_out(rel)
