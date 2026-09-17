"""Webhooks de saída (§196).

CRUD administrativo e processador de entregas. O segredo é devolvido apenas na
criação — depois disso só o hash não existe (é guardado em claro no banco, mas
não reexposto pela API), evitando vazá-lo em listagens e logs de tela.
"""

import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.user import User
from app.models.webhook import WebhookEndpoint, WebhookEntrega
from app.schemas.gestao_avancada import (
    WebhookCreate,
    WebhookCriadoOut,
    WebhookEntregaOut,
    WebhookOut,
    WebhookUpdate,
)
from app.services import webhooks as svc

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


async def _endpoint_ou_404(
    db: AsyncSession, endpoint_id: uuid.UUID, organization_id: uuid.UUID
) -> WebhookEndpoint:
    endpoint = (
        await db.execute(
            select(WebhookEndpoint).where(
                WebhookEndpoint.id == endpoint_id,
                WebhookEndpoint.organization_id == organization_id,
                WebhookEndpoint.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if endpoint is None:
        raise HTTPException(status_code=404, detail="Webhook não encontrado")
    return endpoint


@router.get("", response_model=list[WebhookOut])
async def listar_webhooks(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    itens = (
        (
            await db.execute(
                select(WebhookEndpoint).where(
                    WebhookEndpoint.organization_id == user.organization_id,
                    WebhookEndpoint.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    return [WebhookOut.model_validate(i) for i in itens]


@router.post("", response_model=WebhookCriadoOut, status_code=status.HTTP_201_CREATED)
async def criar_webhook(
    payload: WebhookCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    if not payload.url.startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="A URL deve começar por http:// ou https://")
    endpoint = WebhookEndpoint(
        organization_id=user.organization_id,
        url=payload.url,
        descricao=payload.descricao,
        eventos=payload.eventos,
        secret=secrets.token_urlsafe(32),
    )
    db.add(endpoint)
    await db.commit()
    await db.refresh(endpoint)
    return WebhookCriadoOut.model_validate(endpoint)


@router.patch("/{endpoint_id}", response_model=WebhookOut)
async def atualizar_webhook(
    endpoint_id: uuid.UUID,
    payload: WebhookUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    endpoint = await _endpoint_ou_404(db, endpoint_id, user.organization_id)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(endpoint, campo, valor)
    await db.commit()
    await db.refresh(endpoint)
    return WebhookOut.model_validate(endpoint)


@router.delete("/{endpoint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_webhook(
    endpoint_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    endpoint = await _endpoint_ou_404(db, endpoint_id, user.organization_id)
    endpoint.deleted_at = datetime.now(timezone.utc)
    endpoint.ativo = False
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{endpoint_id}/entregas", response_model=list[WebhookEntregaOut])
async def listar_entregas(
    endpoint_id: uuid.UUID,
    limite: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    await _endpoint_ou_404(db, endpoint_id, user.organization_id)
    entregas = (
        (
            await db.execute(
                select(WebhookEntrega)
                .where(
                    WebhookEntrega.endpoint_id == endpoint_id,
                    WebhookEntrega.organization_id == user.organization_id,
                )
                .order_by(WebhookEntrega.created_at.desc())
                .limit(min(limite, 200))
            )
        )
        .scalars()
        .all()
    )
    return [WebhookEntregaOut.model_validate(e) for e in entregas]


@router.post("/processar")
async def processar_webhooks(
    limite: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    """Entrega as pendentes desta organização. Idempotente por desenho."""
    return await svc.processar_pendentes(db, organization_id=user.organization_id, limite=limite)
