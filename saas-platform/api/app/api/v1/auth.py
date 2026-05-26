import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_module_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.audit_event import AuditEvent
from app.models.module import Module
from app.models.organization import Organization
from app.models.organization_module import OrganizationModule
from app.models.sso_session import SsoSession
from app.models.user import User
from app.schemas.schemas import (
    LoginRequest,
    ModuleAccessRequest,
    ModuleTokenResponse,
    RefreshRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.email == body.email)
    )
    user = result.scalar_one_or_none()

    if not user or user.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account locked. Try again later.",
        )

    if not user.password_hash or not verify_password(body.password, user.password_hash):
        user.password_failures += 1
        if user.password_failures >= settings.PASSWORD_MAX_FAILURES:
            user.locked_until = datetime.now(timezone.utc) + timedelta(
                minutes=settings.PASSWORD_LOCKOUT_MINUTES
            )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    user.password_failures = 0
    user.locked_until = None
    await db.commit()

    roles = []
    if user.platform_role:
        roles.append(user.platform_role)
    elif user.is_platform_admin:
        roles.append("PLATFORM_ADMIN")
    elif user.is_organization_admin:
        roles.append("ADMIN")
    if user.organization_id:
        roles.append("ORG_MEMBER")

    access_token = create_access_token(
        user_id=user.id,
        roles=roles,
        organization_id=user.organization_id,
        is_platform_admin=user.is_platform_admin,
    )

    jti = uuid.uuid4()
    refresh_token = create_refresh_token(user.id, jti)

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=user.organization_id,
        action="login",
        resource_type="user",
        resource_id=str(user.id),
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        payload = decode_token(body.refresh_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(
        select(User).where(User.id == uuid.UUID(user_id))
    )
    user = result.scalar_one_or_none()

    if not user or user.deleted_at is not None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    roles = []
    if user.platform_role:
        roles.append(user.platform_role)
    elif user.is_platform_admin:
        roles.append("PLATFORM_ADMIN")
    if user.organization_id:
        roles.append("ORG_MEMBER")

    access_token = create_access_token(
        user_id=user.id,
        roles=roles,
        organization_id=user.organization_id,
        is_platform_admin=user.is_platform_admin,
    )

    jti = uuid.uuid4()
    refresh_token_str = create_refresh_token(user.id, jti)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token_str,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.post("/module-access", response_model=ModuleTokenResponse)
async def get_module_access(
    body: ModuleAccessRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    module_result = await db.execute(
        select(Module).where(
            Module.slug == body.module_slug,
            Module.is_active.is_(True),
        )
    )
    module = module_result.scalar_one_or_none()
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module not found",
        )

    if user.organization_id:
        org_module_result = await db.execute(
            select(OrganizationModule).where(
                OrganizationModule.organization_id == user.organization_id,
                OrganizationModule.module_id == module.id,
                OrganizationModule.is_active.is_(True),
            )
        )
        org_module = org_module_result.scalar_one_or_none()
        if not org_module:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Organization does not have access to this module",
            )

    roles = []
    if user.platform_role:
        roles.append(user.platform_role)
    elif user.is_platform_admin:
        roles.append("PLATFORM_ADMIN")
    elif user.is_organization_admin:
        roles.append("ADMIN")
    if user.organization_id:
        roles.append("ORG_MEMBER")

    org_id = user.organization_id
    if not org_id:
        org_id = (
            await db.execute(
                select(Organization).where(Organization.is_active.is_(True))
            )
        ).scalars().first()
        if org_id:
            org_id = org_id.id

    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No organization assigned to this user",
        )

    # SSO session timestamps are stored as TIMESTAMP WITHOUT TIME ZONE today.
    expires_at = datetime.utcnow() + timedelta(
        minutes=settings.MODULE_TOKEN_EXPIRE_MINUTES
    )

    session = SsoSession(
        user_id=user.id,
        organization_id=org_id,
        module_slug=module.slug,
        token_jti=str(uuid.uuid4()),
        redirect_url=body.redirect_url,
        expires_at=expires_at,
    )
    db.add(session)

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=org_id,
        action="module_access",
        resource_type="module",
        resource_id=str(module.id),
        details={"module_slug": module.slug},
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()

    module_user_id = user.id
    module_org_id = org_id

    if module.slug == "diario" and settings.DIARIO_MODULE_INTERNAL_API_URL:
        org_payload = None
        if org_id:
            org_result = await db.execute(
                select(Organization).where(Organization.id == org_id)
            )
            org = org_result.scalar_one_or_none()
            if org:
                org_payload = {
                    "organization_id": str(org.id),
                    "name": org.name,
                    "slug": org.slug,
                    "cnpj": org.cnpj,
                    "description": org.description,
                    "logo_url": org.logo_url,
                    "public_url": org.public_url,
                    "is_active": org.is_active,
                }

        user_payload = {
            "user_id": str(user.id),
            "organization_id": str(org_id),
            "name": user.name,
            "email": user.email,
            "is_active": user.is_active,
            "roles": roles,
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {"X-Internal-Key": settings.INTERNAL_API_KEY.get_secret_value()}
            if org_payload:
                org_res = await client.post(
                    f"{settings.DIARIO_MODULE_INTERNAL_API_URL}/internal/sync-organization",
                    json=org_payload,
                    headers=headers,
                )
                org_res.raise_for_status()
                module_org_id = uuid.UUID(org_res.json()["organization_id"])
                user_payload["organization_id"] = str(module_org_id)
            user_res = await client.post(
                f"{settings.DIARIO_MODULE_INTERNAL_API_URL}/internal/sync-user",
                json=user_payload,
                headers=headers,
            )
            user_res.raise_for_status()
            module_user_id = uuid.UUID(user_res.json()["user_id"])

    module_token = create_module_token(
        user_id=module_user_id,
        organization_id=module_org_id,
        roles=roles,
        module_slug=module.slug,
    )

    module_url = module.admin_url or module.base_url
    if module.slug == "diario" and settings.DIARIO_MODULE_ADMIN_URL:
        module_url = settings.DIARIO_MODULE_ADMIN_URL

    return ModuleTokenResponse(
        module_token=module_token,
        module_url=module_url,
        expires_in=settings.MODULE_TOKEN_EXPIRE_MINUTES * 60,
    )
