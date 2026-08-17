"""Painel de auditoria (Administração → Auditoria).

Leitura estrita da trilha `audit_trail` (append-only, encadeada por hash) —
este módulo nunca grava, atualiza nem apaga eventos. Acesso restrito a
AUDITOR/ADMIN (auditor é leitura ampla + trilha, sem poder de edição em
qualquer outro lugar do sistema — ver `core/auth.py::PAPEIS_ATUANTES`).
"""

import uuid
from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.trilha_auditoria import AuditTrail
from app.models.user import User

router = APIRouter(prefix="/auditoria", tags=["auditoria"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
TenantDep = Annotated[object, Depends(get_tenant_id)]
AuditorDep = Annotated[User, Depends(require_roles(RoleName.AUDITOR.value, RoleName.ADMIN.value))]


def _evento_out(e: AuditTrail) -> dict:
    return {
        "id": str(e.id),
        "occurred_at": e.occurred_at.isoformat(),
        "actor_user_id": str(e.actor_user_id) if e.actor_user_id else None,
        "actor_tipo": e.actor_tipo,
        "action": e.action,
        "entity": e.entity,
        "entity_id": e.entity_id,
        "processo_id": str(e.processo_id) if e.processo_id else None,
        "nup": e.nup,
        "ip_address": e.ip_address,
        "user_agent": e.user_agent,
        "finalidade": e.finalidade,
        "hash_registro": e.hash_registro,
    }


@router.get("")
async def listar_auditoria(
    db: DbDep,
    tenant_id: TenantDep,
    user: AuditorDep,
    entity: Optional[str] = Query(default=None),
    entity_id: Optional[str] = Query(default=None),
    processo_id: Optional[uuid.UUID] = Query(default=None),
    actor_user_id: Optional[uuid.UUID] = Query(default=None),
    action: Optional[str] = Query(default=None),
    data_inicio: Optional[datetime] = Query(default=None),
    data_fim: Optional[datetime] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
):
    stmt = select(AuditTrail).where(AuditTrail.tenant_id == tenant_id)
    if entity:
        stmt = stmt.where(AuditTrail.entity == entity)
    if entity_id:
        stmt = stmt.where(AuditTrail.entity_id == entity_id)
    if processo_id:
        stmt = stmt.where(AuditTrail.processo_id == processo_id)
    if actor_user_id:
        stmt = stmt.where(AuditTrail.actor_user_id == actor_user_id)
    if action:
        stmt = stmt.where(AuditTrail.action == action)
    if data_inicio:
        stmt = stmt.where(AuditTrail.occurred_at >= data_inicio)
    if data_fim:
        stmt = stmt.where(AuditTrail.occurred_at <= data_fim)

    stmt = stmt.order_by(AuditTrail.occurred_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return [_evento_out(e) for e in result.scalars()]
