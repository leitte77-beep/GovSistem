import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_client_info, get_current_user
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.models.user import User
from app.models.user_role import UserRole
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse, UserMeResponse, UserRoleOut

login_limiter = Limiter(key_func=get_remote_address)

router = APIRouter(tags=["auth"])


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

    roles = _user_roles(user)
    refresh_jti = uuid.uuid4()
    _ = get_client_info(request)
    return TokenResponse(
        access_token=create_access_token(
            user.id, roles,
            organization_id=user.organization_id,
        ),
        refresh_token=create_refresh_token(user.id, refresh_jti),
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

    roles = _user_roles(user)
    return TokenResponse(
        access_token=create_access_token(
            user.id, roles,
            organization_id=user.organization_id,
        ),
        refresh_token=create_refresh_token(user.id, uuid.uuid4()),
    )


@router.get("/auth/me", response_model=UserMeResponse)
async def me(current_user: User = Depends(get_current_user)) -> UserMeResponse:
    return _user_me(current_user)
