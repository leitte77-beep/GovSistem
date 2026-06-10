import logging
import secrets
import smtplib
import uuid
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

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
from app.models.user_module_grant import UserModuleGrant
from app.schemas.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    ModuleAccessRequest,
    ModuleTokenResponse,
    RefreshRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


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
            detail="E-mail ou senha inválidos",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário inativo",
        )
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Conta bloqueada. Tente novamente mais tarde.",
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
            detail="E-mail ou senha inválidos",
        )

    user.password_failures = 0
    user.locked_until = None
    await db.commit()

    roles = []
    if user.platform_role:
        roles.append(user.platform_role)
    if user.is_platform_admin:
        roles.append("PLATFORM_ADMIN")
    if user.is_organization_admin:
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
    if user.is_platform_admin:
        roles.append("PLATFORM_ADMIN")
    if user.is_organization_admin:
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
    if user.is_platform_admin:
        roles.append("PLATFORM_ADMIN")
    if user.is_organization_admin:
        roles.append("ADMIN")
    if user.organization_id:
        roles.append("ORG_MEMBER")

    # Granular per-module roles granted to this user ("quem pode o quê").
    # These are forwarded verbatim so the module can enforce fine-grained
    # access (e.g. diário: AUTOR + DIAGRAMADOR but not ASSINADOR/PUBLICADOR).
    grant_result = await db.execute(
        select(UserModuleGrant.role_name).where(
            UserModuleGrant.user_id == user.id,
            UserModuleGrant.module_slug == module.slug,
        )
    )
    module_grant_roles = [r for (r,) in grant_result.all()]
    roles = list(dict.fromkeys(roles + module_grant_roles))

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

        try:
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
        except Exception as e:
            logger.warning("Failed to sync with diario module: %s", e)

    if module.slug == "chatgov" and settings.CHATGOV_MODULE_INTERNAL_API_URL:
        user_payload = {
            "user_id": str(user.id),
            "organization_id": str(org_id),
            "name": user.name,
            "email": user.email,
            "is_active": user.is_active,
            "roles": roles,
        }

        sync_org_payload = None
        if org_id:
            org_result = await db.execute(
                select(Organization).where(Organization.id == org_id)
            )
            org = org_result.scalar_one_or_none()
            if org:
                sync_org_payload = {
                    "organization_id": str(org.id),
                    "name": org.name,
                    "slug": org.slug,
                    "cnpj": org.cnpj,
                    "description": org.description,
                    "logo_url": org.logo_url,
                    "public_url": org.public_url,
                    "is_active": org.is_active,
                }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = {"X-Internal-Key": settings.INTERNAL_API_KEY.get_secret_value()}
                if sync_org_payload:
                    org_res = await client.post(
                        f"{settings.CHATGOV_MODULE_INTERNAL_API_URL}/internal/sync-organization",
                        json=sync_org_payload,
                        headers=headers,
                    )
                    org_res.raise_for_status()
                    module_org_id = uuid.UUID(org_res.json()["organization_id"])
                    user_payload["organization_id"] = str(module_org_id)
                user_res = await client.post(
                    f"{settings.CHATGOV_MODULE_INTERNAL_API_URL}/internal/sync-user",
                    json=user_payload,
                    headers=headers,
                )
                user_res.raise_for_status()
                module_user_id = uuid.UUID(user_res.json()["user_id"])
        except Exception as e:
            logger.warning("Failed to sync with chatgov module: %s", e)

    if module.slug == "govtask" and settings.GOVTASK_MODULE_INTERNAL_API_URL:
        user_payload = {
            "user_id": str(user.id),
            "organization_id": str(org_id),
            "name": user.name,
            "email": user.email,
            "is_active": user.is_active,
            "roles": roles,
        }

        sync_org_payload = None
        if org_id:
            org_result = await db.execute(
                select(Organization).where(Organization.id == org_id)
            )
            org = org_result.scalar_one_or_none()
            if org:
                sync_org_payload = {
                    "organization_id": str(org.id),
                    "name": org.name,
                    "slug": org.slug,
                    "cnpj": org.cnpj,
                    "description": org.description,
                    "logo_url": org.logo_url,
                    "public_url": org.public_url,
                    "is_active": org.is_active,
                }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = {"X-Internal-Key": settings.INTERNAL_API_KEY.get_secret_value()}
                if sync_org_payload:
                    org_res = await client.post(
                        f"{settings.GOVTASK_MODULE_INTERNAL_API_URL}/internal/sync-organization",
                        json=sync_org_payload,
                        headers=headers,
                    )
                    org_res.raise_for_status()
                    module_org_id = uuid.UUID(org_res.json()["organization_id"])
                    user_payload["organization_id"] = str(module_org_id)
                user_res = await client.post(
                    f"{settings.GOVTASK_MODULE_INTERNAL_API_URL}/internal/sync-user",
                    json=user_payload,
                    headers=headers,
                )
                user_res.raise_for_status()
                module_user_id = uuid.UUID(user_res.json()["user_id"])
        except Exception as e:
            logger.warning("Failed to sync with govtask module: %s", e)

    if module.slug == "govouve" and settings.GOUVOVE_MODULE_INTERNAL_API_URL:
        user_payload = {
            "user_id": str(user.id),
            "organization_id": str(org_id),
            "name": user.name,
            "email": user.email,
            "is_active": user.is_active,
            "roles": roles,
        }

        sync_org_payload = None
        if org_id:
            org_result = await db.execute(
                select(Organization).where(Organization.id == org_id)
            )
            org = org_result.scalar_one_or_none()
            if org:
                sync_org_payload = {
                    "organization_id": str(org.id),
                    "name": org.name,
                    "slug": org.slug,
                    "cnpj": org.cnpj,
                    "description": org.description,
                    "logo_url": org.logo_url,
                    "public_url": org.public_url,
                    "is_active": org.is_active,
                }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = {"X-Internal-Key": settings.INTERNAL_API_KEY.get_secret_value()}
                if sync_org_payload:
                    org_res = await client.post(
                        f"{settings.GOUVOVE_MODULE_INTERNAL_API_URL}/internal/sync-organization",
                        json=sync_org_payload,
                        headers=headers,
                    )
                    org_res.raise_for_status()
                    module_org_id = uuid.UUID(org_res.json()["organization_id"])
                    user_payload["organization_id"] = str(module_org_id)
                user_res = await client.post(
                    f"{settings.GOUVOVE_MODULE_INTERNAL_API_URL}/internal/sync-user",
                    json=user_payload,
                    headers=headers,
                )
                user_res.raise_for_status()
                module_user_id = uuid.UUID(user_res.json()["user_id"])
        except Exception as e:
            logger.warning("Failed to sync with govouve module: %s", e)

    module_token = create_module_token(
        user_id=module_user_id,
        organization_id=module_org_id,
        roles=roles,
        module_slug=module.slug,
    )

    module_url = module.admin_url or module.base_url
    if module.slug == "diario" and settings.DIARIO_MODULE_ADMIN_URL:
        module_url = settings.DIARIO_MODULE_ADMIN_URL
    elif module.slug == "chatgov" and settings.CHATGOV_MODULE_ADMIN_URL:
        module_url = settings.CHATGOV_MODULE_ADMIN_URL
    elif module.slug == "govtask" and settings.GOVTASK_MODULE_ADMIN_URL:
        module_url = settings.GOVTASK_MODULE_ADMIN_URL
    elif module.slug == "govouve" and settings.GOUVOVE_MODULE_ADMIN_URL:
        module_url = settings.GOUVOVE_MODULE_ADMIN_URL

    return ModuleTokenResponse(
        module_token=module_token,
        module_url=module_url,
        expires_in=settings.MODULE_TOKEN_EXPIRE_MINUTES * 60,
    )


def _send_password_reset_email(to_email: str, reset_link: str):
    smtp_user = settings.SMTP_USER
    smtp_password = settings.SMTP_PASSWORD.get_secret_value()
    if not smtp_user or not smtp_password:
        logger.warning("SMTP not configured — password reset email not sent to %s", to_email)
        return

    msg = MIMEMultipart("alternative")
    msg["From"] = settings.SMTP_FROM or smtp_user
    msg["To"] = to_email
    msg["Subject"] = "GovSistem — Recuperacao de Senha"

    text = (
        f"Ola,\n\n"
        f"Recebemos uma solicitacao de recuperacao de senha para sua conta no GovSistem.\n\n"
        f"Para redefinir sua senha, clique no link abaixo:\n"
        f"{reset_link}\n\n"
        f"O link expira em 30 minutos.\n"
        f"Se voce nao solicitou esta alteracao, ignore este e-mail.\n\n"
        f"Atenciosamente,\n"
        f"Equipe GovSistem"
    )
    html = (
        f'<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:24px">'
        f'<h2 style="color:#004ac6">GovSistem</h2>'
        f'<p>Ola,</p>'
        f'<p>Recebemos uma solicitacao de <strong>recuperacao de senha</strong> para sua conta.</p>'
        f'<p style="margin:24px 0">'
        f'<a href="{reset_link}" style="background:#004ac6;color:#fff;padding:12px 24px;'
        f'border-radius:8px;text-decoration:none;font-weight:600">Redefinir Senha</a>'
        f'</p>'
        f'<p style="color:#737686;font-size:12px">O link expira em 30 minutos.<br>'
        f'Se voce nao solicitou esta alteracao, ignore este e-mail.</p>'
        f'</div>'
    )

    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        if settings.SMTP_USE_SSL:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user, [to_email], msg.as_string())
        server.quit()
        logger.info("Password reset email sent to %s", to_email)
    except Exception as e:
        logger.error("Failed to send password reset email to %s: %s", to_email, e)


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.email == body.email, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        # Return success even if user not found (security best practice)
        return MessageResponse(message="Se o e-mail existir, um link de recuperacao foi enviado.")

    token = secrets.token_urlsafe(32)
    user.reset_token = hash_password(token)  # store hashed
    user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    await db.commit()

    base_url = settings.APP_NAME  # placeholder — frontend handles the URL
    reset_link = f"https://admin.govsistem.com.br/login/reset?token={token}"

    _send_password_reset_email(user.email, reset_link)

    return MessageResponse(message="Se o e-mail existir, um link de recuperacao foi enviado.")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    # Find user by matching hashed token
    result = await db.execute(
        select(User).where(
            User.reset_token_expires_at > datetime.now(timezone.utc),
            User.deleted_at.is_(None),
        )
    )
    users = result.scalars().all()

    matched_user = None
    for u in users:
        if u.reset_token and verify_password(body.token, u.reset_token):
            matched_user = u
            break

    if not matched_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token invalido ou expirado.",
        )

    if len(body.password) < settings.PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Senha deve ter no minimo {settings.PASSWORD_MIN_LENGTH} caracteres.",
        )

    matched_user.password_hash = hash_password(body.password)
    matched_user.reset_token = None
    matched_user.reset_token_expires_at = None
    matched_user.password_failures = 0
    matched_user.locked_until = None
    matched_user.password_changed_at = datetime.now(timezone.utc)
    await db.commit()

    return MessageResponse(message="Senha redefinida com sucesso.")
