"""Endpoints de IA — geracao de documentos assistidos e configuracao."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    get_client_info,
    get_tenant_id,
    require_roles,
)
from app.core.database import get_db
from app.core.encryption import encrypt_text
from app.models.ai_config import AIConfig
from app.models.enums import AuditAction, RoleName
from app.models.user import User
from app.schemas.ai import (
    AIConfigCreate,
    AIConfigOut,
    GenerateRequest,
    GenerateResponse,
)
from app.services.ai_assistant import generate_document
from app.services.audit import record_audit

router = APIRouter(prefix="/ai", tags=["ia"])

_ADMIN_ROLES = require_roles(
    RoleName.ADMIN.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.COORDENADOR_UNIDADE.value,
)

_WRITE_ROLES = require_roles(
    RoleName.ADMIN.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.TECNICO_MEDIO.value,
)


# ─── Geração de documento ──────────────────────────────────────────

@router.post("/generate", response_model=GenerateResponse)
async def ai_generate(
    payload: GenerateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE_ROLES),
):
    """Gera um documento usando IA com base no template e dados fornecidos.

    O documento e gerado usando a configuracao de IA do tenant (orgao).
    Cada tenant configura suas proprias credenciais da OpenAI.
    """
    try:
        documento = await generate_document(
            db=db,
            tenant_id=str(tenant_id),
            template_type=payload.template_type,
            context_data=payload.context,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    client_info = get_client_info(request)
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.CREATE,
        entity="ai_document",
        access_type="WRITE",
        actor=user,
        client_info=client_info,
        diff_summary={"template_type": payload.template_type},
    )

    return GenerateResponse(
        template_type=payload.template_type,
        documento=documento,
    )


# ─── Configuração do tenant ────────────────────────────────────────

@router.get("/config", response_model=AIConfigOut)
async def get_ai_config(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ADMIN_ROLES),
):
    """Retorna a configuracao de IA atual do tenant (sem a senha)."""
    result = await db.execute(
        select(AIConfig).where(AIConfig.tenant_id == str(tenant_id))
    )
    config = result.scalar_one_or_none()
    if config is None:
        raise HTTPException(
            status_code=404,
            detail="Configuracao de IA nao encontrada. Utilize POST /ai/config para criar."
        )
    return config


@router.post("/config", response_model=AIConfigOut, status_code=200)
async def upsert_ai_config(
    payload: AIConfigCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ADMIN_ROLES),
):
    """Cria ou atualiza a configuracao de IA do tenant.

    O campo `password` (API key da OpenAI) e criptografado com Fernet
    antes de ser armazenado no banco.
    """
    result = await db.execute(
        select(AIConfig).where(AIConfig.tenant_id == str(tenant_id))
    )
    existing = result.scalar_one_or_none()

    client_info = get_client_info(request)
    encrypted_password = encrypt_text(payload.password)

    if existing:
        existing.email = payload.email
        existing.encrypted_password = encrypted_password
        existing.enabled = payload.enabled
        existing.model = payload.model
        existing.max_tokens = payload.max_tokens
        config = existing
        action = AuditAction.UPDATE
    else:
        config = AIConfig(
            tenant_id=str(tenant_id),
            provider="openai",
            email=payload.email,
            encrypted_password=encrypted_password,
            enabled=payload.enabled,
            model=payload.model,
            max_tokens=payload.max_tokens,
        )
        db.add(config)
        action = AuditAction.CREATE

    await db.commit()
    await db.refresh(config)

    await record_audit(
        db,
        tenant_id=tenant_id,
        action=action,
        entity="ai_config",
        entity_id=config.id,
        access_type="WRITE",
        actor=user,
        client_info=client_info,
        diff_summary={
            "provider": config.provider,
            "model": config.model,
            "enabled": config.enabled,
            "max_tokens": config.max_tokens,
        },
    )

    return config


@router.delete("/config", status_code=204)
async def delete_ai_config(
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ADMIN_ROLES),
):
    """Remove a configuracao de IA do tenant."""
    result = await db.execute(
        select(AIConfig).where(AIConfig.tenant_id == str(tenant_id))
    )
    config = result.scalar_one_or_none()
    if config is None:
        raise HTTPException(status_code=404, detail="Configuracao de IA nao encontrada.")

    client_info = get_client_info(request)
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.DELETE,
        entity="ai_config",
        entity_id=config.id,
        access_type="WRITE",
        actor=user,
        client_info=client_info,
    )

    await db.delete(config)
    await db.commit()
