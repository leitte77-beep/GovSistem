"""Trilha de auditoria APPEND-ONLY com encadeamento de hash (light blockchain).

`hash_registro = SHA256(hash_anterior || canonical(conteudo))`. O hash anterior
vem do estado da cadeia por tenant (`audit_chain_state`), protegido por lock.
"""

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ActorTipo, AuditAction
from app.models.trilha_auditoria import AuditChainState, AuditTrail


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _canonical(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


async def registrar(
    db: AsyncSession,
    *,
    tenant_id: Optional[uuid.UUID],
    action: AuditAction | str,
    entity: str,
    entity_id: Optional[str] = None,
    actor_user_id: Optional[uuid.UUID] = None,
    actor_tipo: ActorTipo | str = ActorTipo.INTERNO,
    processo_id: Optional[uuid.UUID] = None,
    nup: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    origin: Optional[str] = None,
    finalidade: Optional[str] = None,
    base_legal: Optional[str] = None,
    dados_antes: Optional[dict] = None,
    dados_depois: Optional[dict] = None,
    detalhe: Optional[dict] = None,
) -> AuditTrail:
    """Grava um evento e encadeia o hash. O caller deve commitar a transação."""
    action_value = action.value if isinstance(action, AuditAction) else action
    actor_tipo_value = actor_tipo.value if isinstance(actor_tipo, ActorTipo) else actor_tipo

    dados_antes_hash = _sha256(_canonical(dados_antes)) if dados_antes else None
    dados_depois_hash = _sha256(_canonical(dados_depois)) if dados_depois else None

    hash_anterior: Optional[str] = None
    if tenant_id is not None:
        chain_result = await db.execute(
            select(AuditChainState).where(AuditChainState.tenant_id == tenant_id).with_for_update()
        )
        estado = chain_result.scalar_one_or_none()
        hash_anterior = estado.ultimo_hash if estado else None
    else:
        estado = None

    conteudo = _canonical(
        {
            "tenant_id": str(tenant_id) if tenant_id else None,
            "actor_user_id": str(actor_user_id) if actor_user_id else None,
            "actor_tipo": actor_tipo_value,
            "action": action_value,
            "entity": entity,
            "entity_id": entity_id,
            "processo_id": str(processo_id) if processo_id else None,
            "nup": nup,
            "finalidade": finalidade,
            "base_legal": base_legal,
            "dados_antes_hash": dados_antes_hash,
            "dados_depois_hash": dados_depois_hash,
            "detalhe": detalhe,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    hash_registro = _sha256((hash_anterior or "") + conteudo)

    registro = AuditTrail(
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        actor_tipo=actor_tipo_value,
        action=action_value,
        entity=entity,
        entity_id=entity_id,
        processo_id=processo_id,
        nup=nup,
        ip_address=ip_address,
        user_agent=user_agent,
        origin=origin,
        finalidade=finalidade,
        base_legal=base_legal,
        dados_antes_hash=dados_antes_hash,
        dados_depois_hash=dados_depois_hash,
        detalhe=detalhe,
        hash_anterior=hash_anterior,
        hash_registro=hash_registro,
    )
    db.add(registro)

    if tenant_id is not None:
        if estado is None:
            estado = AuditChainState(tenant_id=tenant_id, ultimo_hash=hash_registro)
            db.add(estado)
        else:
            estado.ultimo_hash = hash_registro

    await db.flush()
    return registro
