import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_client_info, get_current_user, require_roles
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.organization import Organization
from app.models.plan import Plan
from app.models.refresh_token import RefreshToken
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole
from app.schemas.auth import (
    LoginRequest, RefreshRequest, RegisterOrganizationRequest,
    TokenResponse, UserMeResponse, UserRoleOut,
)

login_limiter = Limiter(key_func=get_remote_address)

router = APIRouter(tags=["auth"])


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _user_roles(user: User) -> list[str]:
    return [user_role.role.name for user_role in user.user_roles if user_role.role]


async def _store_refresh_token(
    db: AsyncSession,
    user_id: uuid.UUID,
    token: str,
    ip_address: str,
    user_agent: str,
) -> RefreshToken:
    payload = decode_token(token)
    jti = uuid.UUID(payload["jti"])
    expires_at = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)

    rt = RefreshToken(
        user_id=user_id,
        token_hash=_hash_token(token),
        expires_at=expires_at,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(rt)
    await db.commit()
    return rt


def _user_roles(user: User) -> list[str]:
    return [user_role.role.name for user_role in user.user_roles if user_role.role]


def _user_me(user: User) -> UserMeResponse:
    return UserMeResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        is_active=user.is_active,
        organization_id=user.organization_id,
        roles=[
            UserRoleOut(id=user_role.role.id, name=user_role.role.name, label=user_role.role.label)
            for user_role in user.user_roles
            if user_role.role
        ],
        created_at=user.created_at,
    )


@router.post("/auth/register", response_model=TokenResponse, status_code=201)
async def register_organization(
    payload: RegisterOrganizationRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Register a new organization with an admin user."""
    existing_slug = await db.execute(
        select(Organization).where(Organization.slug == payload.organization_slug)
    )
    if existing_slug.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Organization slug already exists")

    existing_email = await db.execute(
        select(User).where(User.email == payload.admin_email)
    )
    if existing_email.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    free_plan = await db.execute(select(Plan).where(Plan.slug == "free"))
    free_plan = free_plan.scalar_one_or_none()

    org = Organization(
        name=payload.organization_name,
        slug=payload.organization_slug,
        plan_id=free_plan.id if free_plan else None,
        is_active=True,
    )
    db.add(org)
    await db.flush()

    admin_role = await db.execute(select(Role).where(Role.name == "ADMIN"))
    role = admin_role.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=500, detail="Default ADMIN role not found")

    user = User(
        name=payload.admin_name,
        email=payload.admin_email,
        password_hash=hash_password(payload.admin_password),
        organization_id=org.id,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    db.add(UserRole(user_id=user.id, role_id=role.id))
    await db.commit()
    await db.refresh(user)

    roles = [role.name]
    refresh_jti = uuid.uuid4()
    return TokenResponse(
        access_token=create_access_token(
            user.id, roles,
            organization_id=org.id,
        ),
        refresh_token=create_refresh_token(user.id, refresh_jti),
    )


@router.post("/auth/login", response_model=TokenResponse)
@login_limiter.limit("10/minute")
async def login(
    request: Request,
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    result = await db.execute(
        select(User)
        .where(User.email == payload.email, User.deleted_at.is_(None))
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
    )
    user = result.scalar_one_or_none()

    if user is None or user.password_hash is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    now = datetime.now(timezone.utc)
    if user.locked_until and user.locked_until > now:
        raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="User account is locked")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    if user.require_password_change:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password change required. Use /auth/change-password.",
        )

    roles = _user_roles(user)
    refresh_jti = uuid.uuid4()
    client_info = get_client_info(request)
    refresh_token_str = create_refresh_token(user.id, refresh_jti)

    await _store_refresh_token(
        db, user.id, refresh_token_str,
        client_info["ip_address"], client_info["user_agent"],
    )

    return TokenResponse(
        access_token=create_access_token(
            user.id, roles,
            organization_id=user.organization_id,
        ),
        refresh_token=refresh_token_str,
    )


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh_token(
    payload: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    try:
        token_payload = decode_token(payload.refresh_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    if token_payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    user_id = token_payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    result = await db.execute(
        select(User)
        .where(User.id == uuid.UUID(user_id), User.deleted_at.is_(None))
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
    )
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    token_hash = _hash_token(payload.refresh_token)
    rt_result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
        )
    )
    stored = rt_result.scalar_one_or_none()
    if stored is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token revoked or not found",
        )

    stored.revoked_at = datetime.now(timezone.utc)
    await db.commit()

    roles = _user_roles(user)
    new_refresh = create_refresh_token(user.id, uuid.uuid4())
    await _store_refresh_token(
        db, user.id, new_refresh,
        stored.ip_address or "", stored.user_agent or "",
    )

    return TokenResponse(
        access_token=create_access_token(
            user.id, roles,
            organization_id=user.organization_id,
        ),
        refresh_token=new_refresh,
    )


@router.get("/auth/me", response_model=UserMeResponse)
async def me(current_user: User = Depends(get_current_user)) -> UserMeResponse:
    return _user_me(current_user)


@router.post("/auth/logout", status_code=204)
async def logout(
    payload: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    token_hash = _hash_token(payload.refresh_token)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    stored = result.scalar_one_or_none()
    if stored:
        stored.revoked_at = datetime.now(timezone.utc)
        await db.commit()


@router.get("/auth/organizations")
async def list_user_organizations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List organizations accessible by the current user."""
    user_role_names = {ur.role.name for ur in current_user.user_roles}

    if "ADMIN" in user_role_names or "SUPER_ADMIN" in user_role_names:
        result = await db.execute(
            select(Organization).where(Organization.is_active.is_(True))
        )
        orgs = result.scalars().all()
    else:
        if current_user.organization_id is None:
            return []
        result = await db.execute(
            select(Organization).where(
                Organization.id == current_user.organization_id,
                Organization.is_active.is_(True),
            )
        )
        org = result.scalar_one_or_none()
        orgs = [org] if org else []

    return [
        {
            "id": str(o.id),
            "name": o.name,
            "slug": o.slug,
            "is_active": o.is_active,
        }
        for o in orgs
    ]


@router.post("/auth/switch-organization", response_model=TokenResponse)
async def switch_organization(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Switch the active organization and reissue JWT."""
    org_id = body.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="organization_id is required")

    user_role_names = {ur.role.name for ur in current_user.user_roles}
    is_multi_org = "ADMIN" in user_role_names or "SUPER_ADMIN" in user_role_names

    if not is_multi_org and current_user.organization_id != uuid.UUID(org_id):
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    result = await db.execute(
        select(Organization).where(
            Organization.id == uuid.UUID(org_id),
            Organization.is_active.is_(True),
        )
    )
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")

    roles = _user_roles(current_user)
    refresh_jti = uuid.uuid4()
    return TokenResponse(
        access_token=create_access_token(
            current_user.id, roles,
            organization_id=org.id,
        ),
        refresh_token=create_refresh_token(current_user.id, refresh_jti),
    )
