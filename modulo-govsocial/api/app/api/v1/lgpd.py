import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import AuditAction, RoleName
from app.models.retention import RetentionPolicy
from app.models.user import User
from app.schemas.lgpd import (
    DataCorrectionRequest,
    DataDeletionResponse,
    DataExtractOut,
    RetentionPolicyCreate,
    RetentionPolicyOut,
)
from app.services.audit import record_audit
from app.services.lgpd import correct_person_data, delete_person_data, get_data_extract

router = APIRouter(tags=["lgpd"])

_MANAGE = require_roles(
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)


@router.get("/lgpd/extract/{person_id}", response_model=DataExtractOut)
async def extrato_dados(
    person_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    data = await get_data_extract(db, tenant_id, person_id)
    if not data:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada")
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.READ,
        access_type="READ_SENSIVEL", entity="lgpd_extract",
        entity_id=person_id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"acao": "extrato_dados"},
    )
    await db.commit()
    return data


@router.post("/lgpd/correct/{person_id}")
async def corrigir_dados(
    person_id: uuid.UUID,
    body: DataCorrectionRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    result = await correct_person_data(
        db, tenant_id, person_id,
        nome_civil=body.nome_civil,
        nome_social=body.nome_social,
        data_nascimento=body.data_nascimento,
        escolaridade=body.escolaridade,
    )
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="lgpd_correction", entity_id=person_id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"acao": "correcao", "campos": result.get("campos", [])},
    )
    await db.commit()
    return result


@router.post("/lgpd/delete/{person_id}", response_model=DataDeletionResponse)
async def eliminar_dados(
    person_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    result = await delete_person_data(db, tenant_id, person_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.DELETE,
        entity="lgpd_deletion", entity_id=person_id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"acao": "eliminacao_dados"},
    )
    await db.commit()
    return result


# ── Políticas de retenção ────────────────────────────────────────────

@router.get("/retention-policies", response_model=list[RetentionPolicyOut])
async def listar_politicas_retencao(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    rows = (
        await db.execute(
            select(RetentionPolicy).where(RetentionPolicy.tenant_id == tenant_id)
        )
    ).scalars().all()
    return rows


@router.post("/retention-policies", response_model=RetentionPolicyOut, status_code=201)
async def criar_politica_retencao(
    body: RetentionPolicyCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    p = RetentionPolicy(
        tenant_id=tenant_id,
        categoria=body.categoria,
        retencao_dias=body.retencao_dias,
        acao=body.acao,
        base_legal=body.base_legal,
    )
    db.add(p)
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="retention_policy", entity_id=p.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"categoria": p.categoria, "dias": p.retencao_dias},
    )
    await db.commit()
    p = (
        await db.execute(select(RetentionPolicy).where(RetentionPolicy.id == p.id))
    ).scalar_one()
    return p
