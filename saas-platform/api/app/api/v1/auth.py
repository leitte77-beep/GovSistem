import hashlib
import logging
import re
import secrets
import smtplib
import uuid
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_current_platform_admin, get_current_user
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
from app.services.membership import get_membership, resolve_module_roles
from app.services.feature_flag import is_feature_enabled as _is_flag_enabled
from app.schemas.schemas import (
    AccessLogEntry,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    ModuleAccessRequest,
    ModuleTokenResponse,
    ProfileUpdate,
    RefreshRequest,
    ResetPasswordRequest,
    SsoExchangeRequest,
    SwitchTenantRequest,
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
        select(User).where(User.email == body.email, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()

    if not user:
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
        force_password_reset=user.force_password_reset if hasattr(user, 'force_password_reset') else False,
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


@router.post("/switch-tenant", response_model=TokenResponse)
async def switch_tenant(
    body: SwitchTenantRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Troca o tenant ativo de um usuário multi-tenant.

    Deriva o tenant do body (organization_id ou slug), valida o membership ativo
    do usuário e re-emite um access token com `membership_id` + `active_organization_id`.
    O slug NUNCA concede acesso; apenas aponta o tenant a validar.
    """
    org = None
    if body.organization_id:
        org = (
            await db.execute(
                select(Organization).where(
                    Organization.id == body.organization_id,
                    Organization.deleted_at.is_(None),
                    Organization.is_active.is_(True),
                )
            )
        ).scalar_one_or_none()
    elif body.slug:
        org = (
            await db.execute(
                select(Organization).where(
                    Organization.slug == body.slug,
                    Organization.deleted_at.is_(None),
                    Organization.is_active.is_(True),
                )
            )
        ).scalar_one_or_none()
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Informe organization_id ou slug",
        )

    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organização não encontrada",
        )

    mem = await get_membership(db, user.id, org.id)
    if not mem or not mem.is_active or mem.status != "active" or mem.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem vínculo ativo com a organização",
        )

    roles = []
    if user.platform_role:
        roles.append(user.platform_role)
    if user.is_platform_admin:
        roles.append("PLATFORM_ADMIN")
    if mem.membership_role == "ORG_ADMIN":
        roles.append("ADMIN")
    roles.append("ORG_MEMBER")

    access_token = create_access_token(
        user_id=user.id,
        roles=roles,
        organization_id=org.id,
        is_platform_admin=user.is_platform_admin,
        membership_id=mem.id,
        membership_role=mem.membership_role,
    )
    jti = uuid.uuid4()
    refresh_token_str = create_refresh_token(user.id, jti)

    client_info = get_client_info(request)
    db.add(
        AuditEvent(
            actor_id=user.id,
            actor_email=user.email,
            organization_id=org.id,
            action="tenant_switch",
            resource_type="organization",
            resource_id=str(org.id),
            details={"slug": org.slug, "membership_role": mem.membership_role},
            ip_address=client_info["ip_address"],
            user_agent=client_info["user_agent"],
        )
    )
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token_str,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        force_password_reset=user.force_password_reset if hasattr(user, "force_password_reset") else False,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.get("/me/admin", response_model=UserResponse)
async def get_me_platform_admin(user: User = Depends(get_current_platform_admin)):
    """Retorna o usuário somente se for conta interna de plataforma (403 caso contrário).

    Usado pelo painel admin.govsistem.com.br para impedir acesso de gestores e
    usuários comuns de tenants."""
    return user


@router.put("/me", response_model=UserResponse)
async def update_me(
    body: ProfileUpdate,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Allow the current user to update their own profile data.

    Changes are persisted to the same ``users`` table the platform admin sees
    in the SaaS, so they show up immediately under Usuários.
    """
    update_data = body.model_dump(exclude_unset=True)

    if "cpf" in update_data:
        if update_data["cpf"]:
            cleaned = re.sub(r"\D", "", update_data["cpf"])
            if cleaned:
                existing = await db.execute(
                    select(User).where(
                        User.cpf == cleaned,
                        User.id != user.id,
                        User.deleted_at.is_(None),
                    )
                )
                if existing.scalar_one_or_none():
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="CPF já cadastrado para outro usuário.",
                    )
            update_data["cpf"] = cleaned or None
        else:
            update_data["cpf"] = None

    for key, value in update_data.items():
        setattr(user, key, value)

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=user.organization_id,
        action="update_profile",
        resource_type="user",
        resource_id=str(user.id),
        details={k: v for k, v in update_data.items()},
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.password_hash or not verify_password(
        body.current_password, user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senha atual incorreta.",
        )

    if len(body.new_password) < settings.PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A nova senha deve ter no mínimo {settings.PASSWORD_MIN_LENGTH} caracteres.",
        )

    user.password_hash = hash_password(body.new_password)
    user.password_changed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    user.password_failures = 0
    user.locked_until = None
    user.force_password_reset = False

    client_info = get_client_info(request)
    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=user.organization_id,
        action="change_password",
        resource_type="user",
        resource_id=str(user.id),
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()

    return MessageResponse(message="Senha alterada com sucesso.")


@router.get("/me/access-log", response_model=list[AccessLogEntry])
async def get_my_access_log(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current user's recent access events (logins / module access)."""
    result = await db.execute(
        select(AuditEvent)
        .where(
            AuditEvent.actor_id == user.id,
            AuditEvent.action.in_(["login", "module_access"]),
        )
        .order_by(desc(AuditEvent.created_at))
        .limit(10)
    )
    return list(result.scalars().all())


async def _build_org_payload(org_id: uuid.UUID, db: AsyncSession) -> dict | None:
    org_result = await db.execute(
        select(Organization).where(Organization.id == org_id)
    )
    org = org_result.scalar_one_or_none()
    if not org:
        return None
    return {
        "organization_id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "cnpj": org.cnpj,
        "description": org.description,
        "logo_url": org.logo_url,
        "public_url": org.public_url,
        "is_active": org.is_active,
    }


async def _sync_to_module(
    module_slug: str,
    api_url: str,
    user: User,
    org_id: uuid.UUID,
    roles: list[str],
    db: AsyncSession,
) -> tuple[uuid.UUID, uuid.UUID]:
    """Sync user and organization to an external module. Returns (module_user_id, module_org_id)."""
    org_payload = await _build_org_payload(org_id, db) if org_id else None
    user_payload = {
        "user_id": str(user.id),
        "organization_id": str(org_id),
        "name": user.name,
        "email": user.email,
        "is_active": user.is_active,
        "roles": roles,
    }
    new_user_id = user.id
    new_org_id = org_id

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {"X-Internal-Key": settings.INTERNAL_API_KEY.get_secret_value()}
            if org_payload:
                org_res = await client.post(
                    f"{api_url}/internal/sync-organization",
                    json=org_payload,
                    headers=headers,
                )
                org_res.raise_for_status()
                new_org_id = uuid.UUID(org_res.json()["organization_id"])
                user_payload["organization_id"] = str(new_org_id)
            user_res = await client.post(
                f"{api_url}/internal/sync-user",
                json=user_payload,
                headers=headers,
            )
            user_res.raise_for_status()
            new_user_id = uuid.UUID(user_res.json()["user_id"])
    except Exception as e:
        logger.warning("Failed to sync with %s module: %s", module_slug, e)

    return new_user_id, new_org_id


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

    # Órgão ativo derivado do token (multitenant); fallback para o órgão legado.
    from app.core.membership_deps import resolve_active_membership_from_request
    active_membership = await resolve_active_membership_from_request(request, user, db)
    org_id = active_membership.organization_id if active_membership else user.organization_id

    # Isolamento por tenant: se o usuário possui membership suspenso/inativo no
    # órgão legado (users.organization_id), NÃO usar o fallback para autorizar
    # acesso. Isso impede que um usuário suspenso no tenant acesse o módulo.
    if not active_membership and org_id:
        pending_membership = await get_membership(db, user.id, org_id)
        if pending_membership and not (pending_membership.is_active and pending_membership.status == "active"):
            if await _is_flag_enabled(db, "MEMBERSHIP_AUTH_V2_ENABLED"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Usuário suspenso neste órgão",
                )


    if org_id:
        org_module_result = await db.execute(
            select(OrganizationModule).where(
                OrganizationModule.organization_id == org_id,
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
    if active_membership and active_membership.membership_role == "ORG_ADMIN":
        roles.append("ADMIN")
    if org_id:
        roles.append("ORG_MEMBER")

    grant_result = await db.execute(
        select(UserModuleGrant.role_name).where(
            UserModuleGrant.user_id == user.id,
            UserModuleGrant.module_slug == module.slug,
        )
    )
    from app.core.roles import normalize_grant_role
    module_grant_roles = [
        normalize_grant_role(module.slug, r) for (r,) in grant_result.all()
    ]
    roles = list(dict.fromkeys(roles + module_grant_roles))

    # Novo modelo multi-tenant (aditivo): quando ativo, adiciona a claim
    # namespaced module_roles e membership_id, mas NÃO reduz o claim legado
    # `roles` (usado no sync e aceito pelos módulos), para não reduzir acesso.
    from app.services.feature_flag import is_feature_enabled as _ffe
    membership = None
    module_roles_namespaced = None
    membership_id_claim = None
    used_legacy_fallback = False
    if (
        await _ffe(db, "MEMBERSHIP_GRANTS_V2_ENABLED")
        and await _ffe(db, "NEW_SSO_CLAIMS_ENABLED")
        and org_id
    ):
        from app.services.membership import get_membership as _gm, resolve_module_roles as _rmr
        membership = active_membership or await _gm(db, user.id, org_id)
        if membership:
            resolved, _used = await _rmr(db, user, org_id, module.slug)
            module_roles_namespaced = resolved or module_grant_roles
            membership_id_claim = membership.id
            used_legacy_fallback = bool(_used)

    if not org_id:
        # compat legado: usuário sem vínculo ativo, deriva de qualquer org ativa
        first_org = (
            await db.execute(
                select(Organization).where(Organization.is_active.is_(True))
            )
        ).scalars().first()
        if first_org:
            org_id = first_org.id

    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No organization assigned to this user",
        )

    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(
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
        details={"module_slug": module.slug, "used_legacy_fallback": used_legacy_fallback},
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    db.add(audit)
    await db.commit()

    module_user_id = user.id
    module_org_id = org_id

    if module.slug and settings.INTERNAL_API_KEY.get_secret_value():
        module_configs = {
            "diario": settings.DIARIO_MODULE_INTERNAL_API_URL,
            "chatgov": settings.CHATGOV_MODULE_INTERNAL_API_URL,
            "govtask": settings.GOVTASK_MODULE_INTERNAL_API_URL,
            "govavalia": settings.GOVAVALIA_MODULE_INTERNAL_API_URL,
            "govsocial": settings.GOVSOCIAL_MODULE_INTERNAL_API_URL,
            "govdoc": settings.GOVDOC_MODULE_INTERNAL_API_URL,
            "govfrota": settings.GOVFROTA_MODULE_INTERNAL_API_URL,
        }
        api_url = module_configs.get(module.slug)
        if api_url:
            module_user_id, module_org_id = await _sync_to_module(
                module.slug, api_url, user, org_id, roles, db
            )

    module_token = create_module_token(
        user_id=module_user_id,
        organization_id=module_org_id,
        roles=roles,
        module_slug=module.slug,
        name=user.name,
        email=user.email,
        membership_id=membership_id_claim,
        module_roles=module_roles_namespaced,
    )

    module_url = module.admin_url or module.base_url
    if module.slug == "diario" and settings.DIARIO_MODULE_ADMIN_URL:
        module_url = settings.DIARIO_MODULE_ADMIN_URL
    elif module.slug == "chatgov" and settings.CHATGOV_MODULE_ADMIN_URL:
        module_url = settings.CHATGOV_MODULE_ADMIN_URL
    elif module.slug == "govtask" and settings.GOVTASK_MODULE_ADMIN_URL:
        module_url = settings.GOVTASK_MODULE_ADMIN_URL
    elif module.slug == "govavalia" and settings.GOVAVALIA_MODULE_ADMIN_URL:
        module_url = settings.GOVAVALIA_MODULE_ADMIN_URL
    elif module.slug == "govsocial" and settings.GOVSOCIAL_MODULE_ADMIN_URL:
        module_url = settings.GOVSOCIAL_MODULE_ADMIN_URL
    elif module.slug == "govdoc" and settings.GOVDOC_MODULE_ADMIN_URL:
        module_url = settings.GOVDOC_MODULE_ADMIN_URL
    elif module.slug == "govfrota" and settings.GOVFROTA_MODULE_ADMIN_URL:
        module_url = settings.GOVFROTA_MODULE_ADMIN_URL
    return ModuleTokenResponse(
        module_token=module_token,
        module_url=module_url,
        expires_in=settings.MODULE_TOKEN_EXPIRE_MINUTES * 60,
    )


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


@router.post("/sso/issue-code")
async def sso_issue_code(
    body: ModuleAccessRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Emite um código temporário de uso único para SSO backend-to-backend.

    Não coloca token/senha na URL: o navegador recebe apenas o `code` e o
    redireciona ao módulo; o backend do módulo troca o `code` por um token
    diretamente com o SaaS (endpoint /auth/sso/exchange).
    """
    from app.core.membership_deps import resolve_active_membership_from_request
    from app.models.module import Module as _Module

    module = (
        await db.execute(
            select(_Module).where(
                _Module.slug == body.module_slug, _Module.is_active.is_(True)
            )
        )
    ).scalar_one_or_none()
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    active_membership = await resolve_active_membership_from_request(request, user, db)
    org_id = active_membership.organization_id if active_membership else user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No organization assigned")

    org_module = (
        await db.execute(
            select(OrganizationModule).where(
                OrganizationModule.organization_id == org_id,
                OrganizationModule.module_id == module.id,
                OrganizationModule.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not org_module:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organization does not have access to this module")

    code = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=2)
    db.add(
        SsoSession(
            user_id=user.id,
            organization_id=org_id,
            module_slug=module.slug,
            token_jti=_hash_code(code),
            redirect_url=body.redirect_url,
            expires_at=expires_at,
            is_active=True,
        )
    )
    client_info = get_client_info(request)
    db.add(
        AuditEvent(
            actor_id=user.id,
            actor_email=user.email,
            organization_id=org_id,
            action="sso_code_issued",
            resource_type="module",
            resource_id=str(module.id),
            details={"module_slug": module.slug},
            ip_address=client_info["ip_address"],
            user_agent=client_info["user_agent"],
        )
    )
    await db.commit()

    module_url = module.admin_url or module.base_url
    if module.slug == "diario" and settings.DIARIO_MODULE_ADMIN_URL:
        module_url = settings.DIARIO_MODULE_ADMIN_URL
    return {
        "code": code,
        "module_url": module_url,
        "expires_in": 120,
    }


@router.post("/sso/exchange")
async def sso_exchange(
    body: SsoExchangeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Troca o código temporário por um token de módulo (backend-to-backend).

    O código é de uso único, tem validade curta e está vinculado a usuário,
    tenant e módulo. O backend do módulo chama este endpoint com o `code` e o
    `module_slug` para obter o token. Nenhum token viaja na URL.
    """
    return await _do_sso_exchange(body.code, body.module_slug, db)


async def _do_sso_exchange(code: str, module_slug: str, db: AsyncSession) -> dict:
    from app.core.roles import normalize_grant_role

    hashed = _hash_code(code)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    session = (
        await db.execute(
            select(SsoSession).where(
                SsoSession.token_jti == hashed,
                SsoSession.module_slug == module_slug,
                SsoSession.is_active.is_(True),
                SsoSession.expires_at > now,
            )
        )
    ).scalar_one_or_none()
    if not session or session.used_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Código inválido ou expirado")

    user = (
        await db.execute(select(User).where(User.id == session.user_id, User.deleted_at.is_(None)))
    ).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário inválido ou inativo")

    # uso único
    session.is_active = False
    session.used_at = now

    # Membership do usuário no tenant da sessão (valida isolamento).
    membership = await get_membership(db, user.id, session.organization_id) if session.organization_id else None
    if membership and not (membership.is_active and membership.status == "active"):
        if await _is_flag_enabled(db, "MEMBERSHIP_AUTH_V2_ENABLED"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuário suspenso neste órgão",
            )

    roles = []
    if user.platform_role:
        roles.append(user.platform_role)
    if user.is_platform_admin:
        roles.append("PLATFORM_ADMIN")
    if membership and membership.membership_role == "ORG_ADMIN":
        roles.append("ADMIN")
    if session.organization_id:
        roles.append("ORG_MEMBER")

    grant_rows = (
        await db.execute(
            select(UserModuleGrant.role_name).where(
                UserModuleGrant.user_id == user.id,
                UserModuleGrant.module_slug == session.module_slug,
            )
        )
    ).all()
    for (r,) in grant_rows:
        roles.append(normalize_grant_role(session.module_slug, r))
    roles = list(dict.fromkeys(roles))
    module_grant_roles = [
        normalize_grant_role(session.module_slug, r) for (r,) in grant_rows
    ]

    # Novo modelo multi-tenant (aditivo): quando ativo, resolve roles do
    # membership (membership_module_grants) e adiciona claims namespaced.
    membership_id_claim = None
    module_roles_namespaced = None
    if (
        await _is_flag_enabled(db, "MEMBERSHIP_GRANTS_V2_ENABLED")
        and await _is_flag_enabled(db, "NEW_SSO_CLAIMS_ENABLED")
        and membership
    ):
        resolved, _used = await resolve_module_roles(db, user, session.organization_id, session.module_slug)
        module_roles_namespaced = resolved or module_grant_roles
        membership_id_claim = membership.id

    module_token = create_module_token(
        user_id=user.id,
        organization_id=session.organization_id,
        roles=roles,
        module_slug=session.module_slug,
        name=user.name,
        email=user.email,
        membership_id=membership_id_claim,
        module_roles=module_roles_namespaced,
    )
    db.add(
        AuditEvent(
            actor_id=user.id,
            actor_email=user.email,
            organization_id=session.organization_id,
            action="sso_code_exchanged",
            resource_type="module",
            details={"module_slug": session.module_slug},
        )
    )
    await db.commit()
    return {"module_token": module_token, "module": session.module_slug}


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
        return MessageResponse(
            message="Este e-mail nao esta cadastrado em nossa plataforma.",
            exists=False,
        )

    token = secrets.token_urlsafe(32)
    user.reset_token = hash_password(token)  # store hashed
    user.reset_token_expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=30)
    await db.commit()

    reset_link = f"{settings.TENANT_PORTAL_BASE_URL}/login/reset?token={token}"

    _send_password_reset_email(user.email, reset_link)

    return MessageResponse(
        message="Se o e-mail existir, um link de recuperacao foi enviado.",
        exists=True,
    )


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
    matched_user.force_password_reset = False
    await db.commit()

    return MessageResponse(message="Senha redefinida com sucesso.")
