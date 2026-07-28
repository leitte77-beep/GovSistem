import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    get_client_info,
    get_current_user,
    get_tenant_id,
    require_roles,
)
from app.core.database import get_db
from app.models.domain import AccessForm, BenefitType, ReferralCode, ServiceType
from app.models.enums import AuditAction, DomainSource, RoleName
from app.models.user import User
from app.schemas import (
    BenefitTypeOut,
    DomainCreate,
    DomainItemOut,
    DomainUpdate,
    ReferralCodeOut,
    ServiceTypeOut,
)
from app.services.audit import record_audit

router = APIRouter(tags=["domains"])

_MANAGE = require_roles(
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)

_MODELS = {
    "service-types": (ServiceType, "service_type"),
    "access-forms": (AccessForm, "access_form"),
    "referral-codes": (ReferralCode, "referral_code"),
    "benefit-types": (BenefitType, "benefit_type"),
}

_SPECIFIC_FIELDS = {
    ServiceType: {"sigla", "protecao"},
    ReferralCode: {"area"},
    BenefitType: {"categoria", "unidade_medida", "exige_parecer", "periodicidade_max_dias"},
    AccessForm: set(),
}


async def _list(db, model, tenant_id, ativo):
    query = select(model).where(model.tenant_id == tenant_id)
    if ativo is not None:
        query = query.where(model.ativo == ativo)
    query = query.order_by(model.code, model.vigencia_inicio)
    return (await db.execute(query)).scalars().all()


@router.get("/service-types", response_model=list[ServiceTypeOut])
async def listar_service_types(
    ativo: bool | None = Query(True),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(get_current_user),
):
    return await _list(db, ServiceType, tenant_id, ativo)


@router.get("/access-forms", response_model=list[DomainItemOut])
async def listar_access_forms(
    ativo: bool | None = Query(True),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(get_current_user),
):
    return await _list(db, AccessForm, tenant_id, ativo)


@router.get("/referral-codes", response_model=list[ReferralCodeOut])
async def listar_referral_codes(
    ativo: bool | None = Query(True),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(get_current_user),
):
    return await _list(db, ReferralCode, tenant_id, ativo)


@router.get("/benefit-types", response_model=list[BenefitTypeOut])
async def listar_benefit_types(
    ativo: bool | None = Query(True),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(get_current_user),
):
    return await _list(db, BenefitType, tenant_id, ativo)


@router.post("/{domain}", response_model=DomainItemOut, status_code=201)
async def criar_override_local(
    domain: str,
    body: DomainCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    if domain not in _MODELS:
        raise HTTPException(status_code=404, detail="Domínio inválido")
    model, entity = _MODELS[domain]

    data = {
        "tenant_id": tenant_id,
        "code": body.code,
        "nome": body.nome,
        "source": DomainSource.LOCAL.value,
        "vigencia_inicio": body.vigencia_inicio,
        "vigencia_fim": body.vigencia_fim,
        "ativo": body.ativo,
    }
    for field in _SPECIFIC_FIELDS[model]:
        value = getattr(body, field, None)
        if value is not None:
            data[field] = value

    obj = model(**data)
    db.add(obj)
    await db.flush()
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.CREATE,
        entity=entity,
        entity_id=obj.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"code": body.code, "source": "LOCAL"},
    )
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{domain}/{item_id}", response_model=DomainItemOut)
async def atualizar_dominio(
    domain: str,
    item_id: uuid.UUID,
    body: DomainUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    if domain not in _MODELS:
        raise HTTPException(status_code=404, detail="Domínio inválido")
    model, entity = _MODELS[domain]
    obj = (
        await db.execute(
            select(model).where(model.id == item_id, model.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Registro não encontrado")

    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(obj, field, value)

    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.UPDATE,
        entity=entity,
        entity_id=obj.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{domain}/{item_id}", status_code=204)
async def desativar_dominio(
    domain: str,
    item_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    if domain not in _MODELS:
        raise HTTPException(status_code=404, detail="Domínio inválido")
    model, entity = _MODELS[domain]
    obj = (
        await db.execute(
            select(model).where(model.id == item_id, model.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Registro não encontrado")

    obj.ativo = False
    obj.vigencia_fim = obj.vigencia_fim or datetime.now(timezone.utc).date()
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.UPDATE,
        entity=entity,
        entity_id=obj.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"ativo": False},
    )
    await db.commit()
    return None
