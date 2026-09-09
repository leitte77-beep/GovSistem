"""Per-organization AI configuration endpoints (Configurações → IA).

Access is restricted to users holding ``ai.manage`` (read/write config & key,
test connection) or ``ai.audit`` (read execution/usage logs). The API key is
write-only: reads return only a masked hint. Tests may use an ephemeral key
without persisting it; failing a new key never overwrites a working one.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.permissions import require_permission
from app.middleware.audit import log_audit_event
from app.models.ai_config import AiConfig
from app.models.ai_execution import AiExecution
from app.models.enums import (
    AiExecutionKind,
    AiExecutionStatus,
    AuditAction,
)
from app.models.user import User
from app.schemas.ai_config import (
    AiConfigOut,
    AiConfigUpdate,
    AiKeyRequest,
    AiTestRequest,
    AiTestResult,
)
from app.services.ai import config_store
from app.services.ai.deepseek_client import DeepSeekClient
from app.services.ai.errors import (
    AiAuthError,
    AiDisabledError,
    AiInvalidRequestError,
    AiInvalidResponseError,
    AiNotConfiguredError,
    AiProviderUnavailableError,
    AiRateLimitError,
    AiTimeoutError,
    DeepSeekError,
)

router = APIRouter(tags=["ai"])
limiter = Limiter(key_func=get_remote_address)

_EPHEMERAL_KEY_TESTED = (
    "A chave informada foi testada sem ser salva. "
    "Para usá-la em operações reais, cadastre-a com 'Salvar chave'."
)


def _require_org(user: User) -> uuid.UUID:
    if not user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Escopo de organização necessário para configuração de IA.",
        )
    return user.organization_id


def _build_out(cfg: AiConfig) -> AiConfigOut:
    m = cfg.usage_metadata()
    return AiConfigOut(
        enabled=m["enabled"],
        provider=m["provider"],
        model=m["model"],
        endpoint=settings.DEEPSEEK_API_BASE,
        configured=m["configured"],
        key_masked=m["key_masked"],
        limits={
            "timeout_seconds": m["timeout_seconds"],
            "max_tokens": m["max_tokens"],
            "max_concurrency": m["max_concurrency"],
            "monthly_token_limit": m["monthly_token_limit"],
        },
        usage={
            "tokens": m["usage_tokens"],
            "monthly_token_limit": m["monthly_token_limit"],
        },
        last_test={
            "status": m["last_test_status"],
            "at": m["last_test_at"],
            "message": m["last_test_message"],
            "latency_ms": m["last_test_latency_ms"],
        },
        created_at=m["created_at"],
        updated_at=m["updated_at"],
    )


async def _persisted_out(db: AsyncSession, cfg: AiConfig) -> AiConfigOut:
    """Refresh server-generated columns (async) before serializing, so no lazy
    load happens outside an async context."""
    await db.refresh(cfg)
    return _build_out(cfg)


async def _execution(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID | None,
    kind: AiExecutionKind,
    status_: AiExecutionStatus,
    model: str,
    usage: dict | None = None,
    error: dict | None = None,
    duration_ms: int | None = None,
) -> None:
    db.add(
        AiExecution(
            organization_id=organization_id,
            user_id=user_id,
            kind=kind,
            status=status_,
            model=model,
            usage=usage,
            error=error,
            duration_ms=duration_ms,
        )
    )
    await db.flush()


# ── Read config (metadata only — never the key) ─────────────────────────────


@router.get("/ai/config", response_model=AiConfigOut)
async def get_ai_config(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("ai.manage")),
):
    org_id = _require_org(user)
    cfg = await config_store.get_or_create_config(db, org_id)
    await db.commit()
    return await _persisted_out(db, cfg)


# ── Update non-secret settings (+ optional key set) ─────────────────────────


@router.put("/ai/config", response_model=AiConfigOut)
async def update_ai_config(
    body: AiConfigUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("ai.manage")),
):
    org_id = _require_org(user)
    data = body.model_dump(exclude_unset=True)
    new_key = body.api_key
    cfg = await config_store.upsert_config(
        db,
        org_id,
        enabled=body.enabled,
        api_key=new_key,
        timeout_seconds=body.timeout_seconds,
        max_tokens=body.max_tokens,
        max_concurrency=body.max_concurrency,
        monthly_token_limit=body.monthly_token_limit,
        set_monthly_token_limit=("monthly_token_limit" in data),
    )
    await log_audit_event(
        db,
        action=AuditAction.AI_CONFIG_UPDATED,
        user_id=user.id,
        organization_id=org_id,
        entity_type="ai_config",
        entity_id=cfg.id,
        description="Configuração de IA atualizada"
        + (" e chave definida" if (new_key and new_key.strip()) else ""),
        extra_metadata={
            "enabled": cfg.enabled,
            "key_masked": cfg.api_key_masked,
            "fields": sorted(k for k in data if k != "api_key" and data[k] is not None),
        },
        ip_address=(await _ip(request)),
    )
    await db.commit()
    return await _persisted_out(db, cfg)


# ── Explicit key actions ────────────────────────────────────────────────────


@router.post("/ai/config/key", response_model=AiConfigOut)
async def replace_ai_key(
    body: AiKeyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("ai.manage")),
):
    org_id = _require_org(user)
    cfg = await config_store.set_api_key(db, org_id, body.api_key)
    await log_audit_event(
        db,
        action=AuditAction.AI_KEY_REPLACED,
        user_id=user.id,
        organization_id=org_id,
        entity_type="ai_config",
        entity_id=cfg.id,
        description="Chave da API de IA substituída",
        extra_metadata={"key_masked": cfg.api_key_masked},
        ip_address=(await _ip(request)),
    )
    await db.commit()
    return await _persisted_out(db, cfg)


@router.delete("/ai/config/key", status_code=status.HTTP_204_NO_CONTENT)
async def remove_ai_key(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("ai.manage")),
):
    org_id = _require_org(user)
    cfg = await config_store.remove_api_key(db, org_id)
    await log_audit_event(
        db,
        action=AuditAction.AI_KEY_REMOVED,
        user_id=user.id,
        organization_id=org_id,
        entity_type="ai_config",
        entity_id=cfg.id,
        description="Chave da API de IA removida",
        ip_address=(await _ip(request)),
    )
    await db.commit()
    return None


@router.post("/ai/config/disable", response_model=AiConfigOut)
async def disable_ai(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("ai.manage")),
):
    org_id = _require_org(user)
    cfg = await config_store.upsert_config(db, org_id, enabled=False)
    await log_audit_event(
        db,
        action=AuditAction.AI_CONFIG_DISABLED,
        user_id=user.id,
        organization_id=org_id,
        entity_type="ai_config",
        entity_id=cfg.id,
        description="Recursos de IA desativados",
        ip_address=(await _ip(request)),
    )
    await db.commit()
    return await _persisted_out(db, cfg)


# ── Test connection (uses ephemeral key if provided; never persists it) ─────


@router.post("/ai/config/test-connection", response_model=AiTestResult)
@limiter.limit("12/minute")
async def test_ai_connection(
    request: Request,
    body: AiTestRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("ai.manage")),
):
    org_id = _require_org(user)
    ephemeral = body.api_key is not None and body.api_key.strip() != ""
    key_to_test: str | None = None
    persisted = False

    try:
        if ephemeral:
            key_to_test = body.api_key.strip()
        else:
            key_to_test = await config_store.get_active_key(db, org_id)
            persisted = True
    except AiNotConfiguredError as exc:
        await _execution(
            db,
            organization_id=org_id,
            user_id=user.id,
            kind=AiExecutionKind.TEST_CONNECTION,
            status_=AiExecutionStatus.FAILED,
            model=settings.DEEPSEEK_MODEL,
            error=exc.as_dict(),
        )
        await log_audit_event(
            db,
            action=AuditAction.AI_CONFIG_TESTED,
            user_id=user.id,
            organization_id=org_id,
            entity_type="ai_config",
            description="Teste de conexão IA sem chave configurada",
            extra_metadata={"ok": False, "ephemeral": ephemeral},
            ip_address=(await _ip(request)),
        )
        await db.commit()
        return AiTestResult(ok=False, status="not_configured", message=_pt_msg(exc))

    client = DeepSeekClient(key_to_test)
    error: dict | None = None
    result_status = "ok"
    result_ok = True
    message: str | None = None
    latency_ms: int | None = None
    usage: dict = {}
    try:
        ping = await client.minimal_ping()
        latency_ms = ping.get("latency_ms")
        usage = ping.get("usage", {})
    except DeepSeekError as exc:
        result_ok = False
        result_status = _status_for(exc)
        message = _pt_msg(exc)
        error = exc.as_dict()

    if persisted:
        cfg = await config_store.get_or_create_config(db, org_id)
        await config_store.record_test(
            db,
            cfg,
            status=result_status,
            message=message or ("Conexão bem-sucedida." if result_ok else None),
            latency_ms=latency_ms,
        )

    await _execution(
        db,
        organization_id=org_id,
        user_id=user.id,
        kind=AiExecutionKind.TEST_CONNECTION,
        status_=AiExecutionStatus.SUCCEEDED if result_ok else AiExecutionStatus.FAILED,
        model=settings.DEEPSEEK_MODEL,
        usage=usage or None,
        error=error,
        duration_ms=latency_ms,
    )
    await log_audit_event(
        db,
        action=AuditAction.AI_CONFIG_TESTED,
        user_id=user.id,
        organization_id=org_id,
        entity_type="ai_config",
        description="Teste de conexão de IA",
        extra_metadata={"ok": result_ok, "ephemeral": ephemeral, "status": result_status},
        ip_address=(await _ip(request)),
    )
    await db.commit()
    note = _EPHEMERAL_KEY_TESTED if (ephemeral and result_ok) else None
    return AiTestResult(
        ok=result_ok,
        status=result_status,
        message=message,
        latency_ms=latency_ms,
        usage=usage,
        note=note,
    )


# ── Execution/usage log (restricted) ────────────────────────────────────────


@router.get("/ai/executions")
async def list_ai_executions(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("ai.audit", "ai.manage")),
):
    org_id = _require_org(user)
    limit = max(1, min(limit, 200))
    result = await db.execute(
        select(AiExecution)
        .where(AiExecution.organization_id == org_id)
        .order_by(AiExecution.created_at.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "kind": r.kind,
            "status": r.status,
            "model": r.model,
            "prompt_version": r.prompt_version,
            "usage": r.usage or {},
            "error": r.error,
            "duration_ms": r.duration_ms,
            "created_at": r.created_at,
        }
        for r in rows
    ]


async def _ip(request: Request) -> str | None:
    try:
        from app.middleware.audit import capture_request_info

        info = await capture_request_info(request)
        return info.get("ip_address")
    except Exception:  # noqa: BLE001
        return None


def _status_for(exc: DeepSeekError) -> str:
    if isinstance(exc, AiAuthError):
        return "authentication"
    if isinstance(exc, AiRateLimitError):
        return "rate_limited"
    if isinstance(exc, AiTimeoutError):
        return "timeout"
    if isinstance(exc, AiInvalidRequestError):
        return "invalid_request"
    if isinstance(exc, AiInvalidResponseError):
        return "invalid_response"
    if isinstance(exc, AiProviderUnavailableError):
        return "unavailable"
    if isinstance(exc, AiDisabledError):
        return "disabled"
    if isinstance(exc, AiNotConfiguredError):
        return "not_configured"
    return "error"


def _pt_msg(exc: DeepSeekError) -> str:
    """Portuguese, actionable message keyed by stable code (no secrets/raw)."""
    return {
        "api_not_configured": (
            "Nenhuma chave de IA cadastrada. Cadastre a chave da API DeepSeek antes de testar."
        ),
        "ai_disabled": "Os recursos de IA estão desativados para esta organização.",
        "authentication": (
            "Falha de autenticação com o provedor de IA. Verifique se a chave está correta e ativa."
        ),
        "rate_limited": ("Limite de uso/quota do provedor de IA atingido. Tente novamente."),
        "timeout": "O provedor de IA não respondeu dentro do tempo limite.",
        "provider_unavailable": "O provedor de IA está indisponível no momento.",
        "invalid_request": "Requisição inválida ao provedor de IA (configuração).",
        "invalid_response": "O provedor retornou uma resposta inesperada.",
        "usage_limit_exceeded": "Limite mensal de uso de IA atingido.",
        "ai_provider_error": "Erro ao comunicar com o provedor de IA.",
    }.get(exc.code, "Erro ao comunicar com o provedor de IA.")
