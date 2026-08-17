"""Acesso externo pontual a processo específico (integral ou parcial, com validade)."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cidadao import AcessoExterno
from app.models.processo import Processo
from app.models.user import User
from app.services.auditoria import registrar


async def conceder(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    usuario_externo_id: Optional[uuid.UUID] = None,
    email_externo: Optional[str] = None,
    escopo: Optional[dict] = None,
    expira_em: Optional[datetime] = None,
    client: Optional[dict] = None,
) -> AcessoExterno:
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")

    if usuario_externo_id is None and not email_externo:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Informe o usuário ou e-mail do terceiro",
        )

    acesso = AcessoExterno(
        tenant_id=tenant_id,
        processo_id=processo.id,
        usuario_externo_id=usuario_externo_id,
        email_externo=email_externo,
        escopo=escopo,
        expira_em=expira_em,
        concedido_por_user_id=user.id,
    )
    db.add(acesso)

    await registrar(
        db,
        tenant_id=tenant_id,
        action="CRIACAO",
        entity="acesso_externo",
        entity_id=str(acesso.id),
        actor_user_id=user.id,
        processo_id=processo.id,
        nup=processo.nup,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
    )

    await db.commit()
    await db.refresh(acesso)
    return acesso


async def revogar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    acesso_id: uuid.UUID,
    client: Optional[dict] = None,
) -> AcessoExterno:
    acesso = await db.get(AcessoExterno, acesso_id)
    if acesso is None or acesso.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acesso não encontrado")

    acesso.revogado_em = datetime.now(timezone.utc)

    await registrar(
        db,
        tenant_id=tenant_id,
        action="EDICAO",
        entity="acesso_externo",
        entity_id=str(acesso.id),
        actor_user_id=user.id,
        processo_id=acesso.processo_id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
    )

    await db.commit()
    await db.refresh(acesso)
    return acesso
