"""Persistence helpers for the per-organization AI configuration.

The DeepSeek API key is stored encrypted-at-rest with the same versioned
Fernet key ring used for other secrets (master key lives outside the DB and
outside the repository). Only masked metadata is ever returned to clients;
there is deliberately no public endpoint that reveals the plaintext key.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.ai_config import AiConfig
from app.services.ai.errors import AiDisabledError, AiNotConfiguredError
from app.services.encryption import decrypt, encrypt

logger = logging.getLogger(__name__)


def mask_key(raw_key: str) -> str:
    """Return a masked hint (``****wxyz``) — never the full key."""
    cleaned = raw_key.strip()
    if not cleaned:
        return "****"
    return f"****{cleaned[-4:]}" if len(cleaned) > 4 else "****"


async def get_config(db: AsyncSession, organization_id: uuid.UUID) -> AiConfig | None:
    result = await db.execute(select(AiConfig).where(AiConfig.organization_id == organization_id))
    return result.scalar_one_or_none()


async def get_or_create_config(db: AsyncSession, organization_id: uuid.UUID) -> AiConfig:
    cfg = await get_config(db, organization_id)
    if cfg is None:
        cfg = AiConfig(
            organization_id=organization_id,
            enabled=True,
            provider="deepseek",
            model=settings.DEEPSEEK_MODEL,
            timeout_seconds=settings.AI_DEFAULT_TIMEOUT_SECONDS,
            max_tokens=settings.AI_MAX_TOKENS,
            max_concurrency=settings.AI_MAX_CONCURRENCY,
        )
        db.add(cfg)
        await db.flush()
    return cfg


async def get_active_key(db: AsyncSession, organization_id: uuid.UUID) -> str:
    """Return the decrypted key (internal only) or raise a typed error."""
    cfg = await get_config(db, organization_id)
    if cfg is None or not cfg.api_key_ciphertext:
        raise AiNotConfiguredError("Nenhuma chave de IA configurada para esta organização.")
    if not cfg.enabled:
        raise AiDisabledError("Recursos de IA desativados para esta organização.")
    try:
        return decrypt(cfg.api_key_ciphertext)
    except Exception as exc:  # noqa: BLE001 - master-key failure must not leak
        logger.warning("Unable to decrypt AI key for org %s", organization_id)
        raise AiNotConfiguredError(
            "Configuração de IA indisponível: não foi possível recuperar a chave."
        ) from exc


async def upsert_config(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    enabled: bool | None = None,
    api_key: str | None = None,
    timeout_seconds: int | None = None,
    max_tokens: int | None = None,
    max_concurrency: int | None = None,
    monthly_token_limit: int | None = None,
    set_monthly_token_limit: bool = False,
) -> AiConfig:
    """Create/update a config. ``api_key=None`` (or blank) preserves the key."""
    cfg = await get_or_create_config(db, organization_id)
    if enabled is not None:
        cfg.enabled = enabled
    if timeout_seconds is not None:
        cfg.timeout_seconds = timeout_seconds
    if max_tokens is not None:
        cfg.max_tokens = max_tokens
    if max_concurrency is not None:
        cfg.max_concurrency = max_concurrency
    if set_monthly_token_limit:
        cfg.monthly_token_limit = monthly_token_limit
    if api_key is not None and api_key.strip():
        cfg.api_key_ciphertext = encrypt(api_key.strip())
        cfg.api_key_masked = mask_key(api_key)
        cfg.secret_ref = None
    await db.flush()
    return cfg


async def set_api_key(db: AsyncSession, organization_id: uuid.UUID, api_key: str) -> AiConfig:
    return await upsert_config(db, organization_id, api_key=api_key)


async def remove_api_key(db: AsyncSession, organization_id: uuid.UUID) -> AiConfig:
    cfg = await get_or_create_config(db, organization_id)
    cfg.api_key_ciphertext = None
    cfg.api_key_masked = None
    cfg.secret_ref = None
    await db.flush()
    return cfg


async def record_test(
    db: AsyncSession,
    cfg: AiConfig,
    *,
    status: str,
    message: str | None = None,
    latency_ms: int | None = None,
) -> None:
    cfg.last_test_status = status
    cfg.last_test_at = datetime.now(timezone.utc)
    cfg.last_test_message = (message or "")[:500]
    cfg.last_test_latency_ms = latency_ms
    await db.flush()


__all__ = [
    "mask_key",
    "get_config",
    "get_or_create_config",
    "get_active_key",
    "upsert_config",
    "set_api_key",
    "remove_api_key",
    "record_test",
]
