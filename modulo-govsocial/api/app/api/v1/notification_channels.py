"""Endpoints de configuracao dos canais de notificacao multicanal."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.core.encryption import encrypt_text
from app.models.enums import RoleName
from app.models.notification_config import NotificationChannelConfig
from app.models.user import User
from app.schemas.notification_config import (
    NotificationChannelCreate,
    NotificationChannelOut,
    NotificationChannelTest,
    NotificationChannelUpdate,
)
from app.services.notification_dispatcher import NotificationDispatcher

router = APIRouter(tags=["notification-channels"])

_ADMIN = require_roles(RoleName.ADMIN.value, RoleName.GESTOR_MUNICIPAL.value)
_READ = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)

SENSITIVE_KEYS = {
    "smtp_password",
    "smtp_user",
    "api_key",
    "twilio_account_sid",
    "twilio_auth_token",
    "fcm_server_key",
    "fcm_service_account_json",
}


def _sanitize_config(config: dict) -> dict:
    """Remove ou mascara chaves sensiveis para exposicao na API."""
    sanitized = {}
    for k, v in config.items():
        if k in SENSITIVE_KEYS:
            sanitized[k] = "••••••••"
        else:
            sanitized[k] = v
    return sanitized


def _encrypt_sensitive(config: dict) -> dict:
    """Criptografa valores sensiveis antes de persistir."""
    encrypted = {}
    for k, v in config.items():
        if k in SENSITIVE_KEYS and isinstance(v, str) and v:
            encrypted[k] = encrypt_text(v)
        else:
            encrypted[k] = v
    return encrypted


# ── CRUD ──────────────────────────────────────────────────────────────


@router.get("/notification-channels", response_model=list[NotificationChannelOut])
async def list_channels(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    result = await db.execute(
        select(NotificationChannelConfig).where(
            NotificationChannelConfig.tenant_id == tenant_id,
        ).order_by(NotificationChannelConfig.channel)
    )
    rows = result.scalars().all()
    out = []
    for r in rows:
        safe = r.config_json.copy()
        safe = _sanitize_config(safe)
        out.append(NotificationChannelOut(
            id=r.id,
            channel=r.channel,
            enabled=r.enabled,
            label=r.label,
            config_json=safe,
            created_at=r.created_at,
            updated_at=r.updated_at,
        ))
    return out


@router.post("/notification-channels", status_code=201, response_model=NotificationChannelOut)
async def create_channel(
    payload: NotificationChannelCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ADMIN),
):
    channel_upper = payload.channel.upper()
    if channel_upper not in ("EMAIL", "WHATSAPP", "PUSH", "SMS"):
        raise HTTPException(
            status_code=422,
            detail="Canal invalido. Use: EMAIL, WHATSAPP, PUSH, SMS",
        )

    existing = (
        await db.execute(
            select(NotificationChannelConfig).where(
                NotificationChannelConfig.tenant_id == tenant_id,
                NotificationChannelConfig.channel == channel_upper,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Canal ja configurado. Atualize o existente.")

    cfg = NotificationChannelConfig(
        tenant_id=tenant_id,
        channel=channel_upper,
        enabled=payload.enabled,
        config_json=_encrypt_sensitive(payload.config_json),
        label=payload.label,
    )
    db.add(cfg)
    await db.commit()
    await db.refresh(cfg)

    safe = _sanitize_config(cfg.config_json)
    return NotificationChannelOut(
        id=cfg.id,
        channel=cfg.channel,
        enabled=cfg.enabled,
        label=cfg.label,
        config_json=safe,
        created_at=cfg.created_at,
        updated_at=cfg.updated_at,
    )


@router.patch("/notification-channels/{channel_id}", response_model=NotificationChannelOut)
async def update_channel(
    channel_id: uuid.UUID,
    payload: NotificationChannelUpdate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ADMIN),
):
    cfg = (
        await db.execute(
            select(NotificationChannelConfig).where(
                NotificationChannelConfig.id == channel_id,
                NotificationChannelConfig.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not cfg:
        raise HTTPException(status_code=404)

    if payload.enabled is not None:
        cfg.enabled = payload.enabled
    if payload.label is not None:
        cfg.label = payload.label
    if payload.config_json is not None:
        cfg.config_json = _encrypt_sensitive(payload.config_json)

    await db.commit()
    await db.refresh(cfg)

    safe = _sanitize_config(cfg.config_json)
    return NotificationChannelOut(
        id=cfg.id,
        channel=cfg.channel,
        enabled=cfg.enabled,
        label=cfg.label,
        config_json=safe,
        created_at=cfg.created_at,
        updated_at=cfg.updated_at,
    )


@router.delete("/notification-channels/{channel_id}", status_code=204)
async def delete_channel(
    channel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ADMIN),
):
    cfg = (
        await db.execute(
            select(NotificationChannelConfig).where(
                NotificationChannelConfig.id == channel_id,
                NotificationChannelConfig.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not cfg:
        raise HTTPException(status_code=404)
    await db.delete(cfg)
    await db.commit()


# ── Teste ─────────────────────────────────────────────────────────────


@router.post("/notification-channels/test")
async def test_channel(
    payload: NotificationChannelTest,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ADMIN),
):
    dispatcher = NotificationDispatcher(db)

    if payload.channel_id:
        cfg = (
            await db.execute(
                select(NotificationChannelConfig).where(
                    NotificationChannelConfig.id == payload.channel_id,
                    NotificationChannelConfig.tenant_id == tenant_id,
                )
            )
        ).scalar_one_or_none()
        if not cfg:
            raise HTTPException(status_code=404)
        channel = cfg.channel
    elif payload.channel:
        channel = payload.channel.upper()
    else:
        raise HTTPException(status_code=422, detail="Informe channel_id ou channel")

    result = await dispatcher.send_test(
        tenant_id=tenant_id,
        channel=channel,
        destination=payload.destination,
        message=payload.message,
    )
    return result
