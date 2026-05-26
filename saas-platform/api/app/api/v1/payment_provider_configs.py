import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.audit_event import AuditEvent
from app.models.payment_provider_config import PaymentProviderConfig
from app.models.user import User
from app.services.encryption import decrypt, encrypt

router = APIRouter(prefix="/payment-provider-configs", tags=["payment-provider-configs"])


class ProviderConfigResponse(BaseModel):
    id: str
    organization_id: str
    provider: str
    environment: str
    pix_enabled: bool
    boleto_enabled: bool
    credit_card_enabled: bool
    default_billing_type: str
    wallet_id: Optional[str] = None
    status: str
    has_api_key: bool = False
    has_webhook_token: bool = False

    model_config = {"from_attributes": True}


class ProviderConfigCreate(BaseModel):
    provider: str = "asaas"
    environment: str = "sandbox"
    api_key: str = ""
    webhook_token: str = ""
    pix_enabled: bool = True
    boleto_enabled: bool = True
    credit_card_enabled: bool = True
    default_billing_type: str = "UNDEFINED"
    wallet_id: Optional[str] = None


class ProviderConfigUpdate(BaseModel):
    environment: Optional[str] = None
    api_key: Optional[str] = None
    webhook_token: Optional[str] = None
    pix_enabled: Optional[bool] = None
    boleto_enabled: Optional[bool] = None
    credit_card_enabled: Optional[bool] = None
    default_billing_type: Optional[str] = None
    wallet_id: Optional[str] = None
    status: Optional[str] = None


@router.get("", response_model=list[ProviderConfigResponse])
async def list_provider_configs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    query = select(PaymentProviderConfig)
    if user.organization_id:
        query = query.where(PaymentProviderConfig.organization_id == user.organization_id)

    result = await db.execute(query)
    configs = result.scalars().all()

    return [
        ProviderConfigResponse(
            id=str(c.id),
            organization_id=str(c.organization_id),
            provider=c.provider,
            environment=c.environment,
            pix_enabled=c.pix_enabled,
            boleto_enabled=c.boleto_enabled,
            credit_card_enabled=c.credit_card_enabled,
            default_billing_type=c.default_billing_type,
            wallet_id=c.wallet_id,
            status=c.status,
            has_api_key=bool(c.api_key_encrypted),
            has_webhook_token=bool(c.webhook_token_encrypted),
        )
        for c in configs
    ]


@router.post("", response_model=ProviderConfigResponse, status_code=201)
async def create_provider_config(
    body: ProviderConfigCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    if not user.organization_id:
        raise HTTPException(status_code=400, detail="Usuário sem organização")

    existing = await db.execute(
        select(PaymentProviderConfig).where(
            PaymentProviderConfig.organization_id == user.organization_id,
            PaymentProviderConfig.provider == body.provider,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Config para {body.provider} já existe")

    config = PaymentProviderConfig(
        organization_id=user.organization_id,
        provider=body.provider,
        environment=body.environment,
        api_key_encrypted=encrypt(body.api_key) if body.api_key else None,
        webhook_token_encrypted=encrypt(body.webhook_token) if body.webhook_token else None,
        pix_enabled=body.pix_enabled,
        boleto_enabled=body.boleto_enabled,
        credit_card_enabled=body.credit_card_enabled,
        default_billing_type=body.default_billing_type,
        wallet_id=body.wallet_id,
        status="active",
        created_by=user.id,
    )
    db.add(config)

    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=user.organization_id,
        action="create_provider_config",
        resource_type="payment_provider_config",
        details={"provider": body.provider, "environment": body.environment},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(config)

    return ProviderConfigResponse(
        id=str(config.id),
        organization_id=str(config.organization_id),
        provider=config.provider,
        environment=config.environment,
        pix_enabled=config.pix_enabled,
        boleto_enabled=config.boleto_enabled,
        credit_card_enabled=config.credit_card_enabled,
        default_billing_type=config.default_billing_type,
        wallet_id=config.wallet_id,
        status=config.status,
        has_api_key=bool(config.api_key_encrypted),
        has_webhook_token=bool(config.webhook_token_encrypted),
    )


@router.put("/{config_id}", response_model=ProviderConfigResponse)
async def update_provider_config(
    config_id: uuid.UUID,
    body: ProviderConfigUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(PaymentProviderConfig).where(PaymentProviderConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config não encontrada")

    if user.organization_id and config.organization_id != user.organization_id:
        raise HTTPException(status_code=403, detail="Acesso negado")

    if body.environment is not None:
        config.environment = body.environment
    if body.api_key is not None:
        config.api_key_encrypted = encrypt(body.api_key) if body.api_key else None
    if body.webhook_token is not None:
        config.webhook_token_encrypted = encrypt(body.webhook_token) if body.webhook_token else None
    if body.pix_enabled is not None:
        config.pix_enabled = body.pix_enabled
    if body.boleto_enabled is not None:
        config.boleto_enabled = body.boleto_enabled
    if body.credit_card_enabled is not None:
        config.credit_card_enabled = body.credit_card_enabled
    if body.default_billing_type is not None:
        config.default_billing_type = body.default_billing_type
    if body.wallet_id is not None:
        config.wallet_id = body.wallet_id
    if body.status is not None:
        config.status = body.status

    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=user.organization_id,
        action="update_provider_config",
        resource_type="payment_provider_config",
        resource_id=str(config.id),
        details={"provider": config.provider, "environment": config.environment},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(config)

    return ProviderConfigResponse(
        id=str(config.id),
        organization_id=str(config.organization_id),
        provider=config.provider,
        environment=config.environment,
        pix_enabled=config.pix_enabled,
        boleto_enabled=config.boleto_enabled,
        credit_card_enabled=config.credit_card_enabled,
        default_billing_type=config.default_billing_type,
        wallet_id=config.wallet_id,
        status=config.status,
        has_api_key=bool(config.api_key_encrypted),
        has_webhook_token=bool(config.webhook_token_encrypted),
    )


@router.post("/{config_id}/test-connection")
async def test_provider_connection(
    config_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(PaymentProviderConfig).where(PaymentProviderConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config não encontrada")
    if user.organization_id and config.organization_id != user.organization_id:
        raise HTTPException(status_code=403, detail="Acesso negado")

    api_key = decrypt(config.api_key_encrypted) if config.api_key_encrypted else ""
    if not api_key:
        raise HTTPException(status_code=400, detail="API key não configurada")

    try:
        import httpx
        if config.environment == "production":
            base = settings.ASAAS_BASE_URL_PRODUCTION
        else:
            base = settings.ASAAS_BASE_URL_SANDBOX

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{base}/payments?limit=1",
                headers={"access_token": api_key},
            )
            if resp.status_code == 200:
                return {"status": "ok", "message": "Conexão estabelecida com sucesso"}
            elif resp.status_code == 401:
                return {"status": "error", "message": "API key inválida"}
            else:
                return {"status": "error", "message": f"Erro HTTP {resp.status_code}: {resp.text[:200]}"}
    except httpx.ConnectError:
        return {"status": "error", "message": "Não foi possível conectar ao Asaas"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


@router.delete("/{config_id}", status_code=204)
async def delete_provider_config(
    config_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(PaymentProviderConfig).where(PaymentProviderConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config não encontrada")

    if user.organization_id and config.organization_id != user.organization_id:
        raise HTTPException(status_code=403, detail="Acesso negado")

    await db.delete(config)

    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=user.organization_id,
        action="delete_provider_config",
        resource_type="payment_provider_config",
        resource_id=str(config.id),
    )
    db.add(audit)
    await db.commit()
