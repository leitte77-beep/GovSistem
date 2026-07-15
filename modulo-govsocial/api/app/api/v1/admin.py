import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    get_client_info,
    get_tenant_id,
    require_roles,
    user_role_names,
)
from app.core.database import get_db
from app.core.seed_bulk import seed_bulk_municipio
from app.core.seeds import seed_national_domains, seed_notificacoes_por_papel
from app.models.enums import AuditAction, RoleName
from app.models.organization import Organization
from app.models.user import User
from app.services.audit import record_audit

router = APIRouter(prefix="/admin", tags=["admin"])

_ADMIN = require_roles(RoleName.ADMIN.value, RoleName.SUPORTE_GOVASSIST.value)
_GESTOR = require_roles(RoleName.GESTOR_MUNICIPAL.value, RoleName.ADMIN.value)


@router.post("/seed-national")
async def seed_nacional(
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ADMIN),
):
    """Copia o seed nacional dos domínios para o tenant (onboarding).

    O perfil suporte_govassist só pode operar se o tenant registrou consentimento
    (Organization.suporte_consentido) — trilha reforçada.
    """
    org = await db.get(Organization, tenant_id)
    if not org:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")

    is_suporte = RoleName.SUPORTE_GOVASSIST.value in user_role_names(user)
    is_admin = RoleName.ADMIN.value in user_role_names(user)
    if is_suporte and not is_admin and not org.suporte_consentido:
        raise HTTPException(
            status_code=403,
            detail="Suporte requer consentimento registrado do tenant",
        )

    counts = await seed_national_domains(db, tenant_id)
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.SEED,
        entity="domain_national_seed",
        entity_id=tenant_id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary=counts,
    )
    await db.commit()
    return {"status": "ok", "seeded": counts}


@router.post("/seed-bulk")
async def seed_bulk(
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_GESTOR),
):
    """Gera 200 famílias realistas com dados para piloto/demo."""
    org = await db.get(Organization, tenant_id)
    if not org:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")

    counts = await seed_bulk_municipio(db, tenant_id)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.SEED,
        entity="seed_bulk", entity_id=tenant_id, actor=user,
        client_info=get_client_info(request), diff_summary=counts,
    )
    await db.commit()
    return {"status": "ok", "seeded": counts}


@router.post("/seed-notificacoes")
async def seed_notificacoes(
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ADMIN),
):
    """Gera notificações de exemplo segmentadas por papel (role_alvo).

    Cada papel (gestor_municipal, tecnico_superior, recepcao etc.) recebe
    notificações contextualizadas com seu fluxo de trabalho.
    """
    org = await db.get(Organization, tenant_id)
    if not org:
        raise HTTPException(status_code=404, detail="Tenant não encontrado")

    count = await seed_notificacoes_por_papel(db, tenant_id)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.SEED,
        entity="seed_notificacoes", entity_id=tenant_id, actor=user,
        client_info=get_client_info(request), diff_summary={"total": count},
    )
    await db.commit()
    return {"status": "ok", "seeded": {"notificacoes": count}}
