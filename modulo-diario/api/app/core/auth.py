import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_module_token
from app.models.user import User
from app.models.user_role import UserRole

logger = logging.getLogger("diario.auth")

bearer_scheme = HTTPBearer(auto_error=False)


async def require_internal_key(
    x_internal_key: Annotated[str | None, Header()] = None,
) -> None:
    internal_key = settings.INTERNAL_API_KEY.get_secret_value()
    if not internal_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Internal API not configured",
        )
    if x_internal_key != internal_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal key",
        )


class CurrentUser:
    def __init__(self, user_id: uuid.UUID, organization_id: uuid.UUID, roles: list[str], user: User | None = None):
        self.id = user_id
        self.organization_id = organization_id
        self.roles = roles
        self._user = user

    @property
    def user(self) -> User | None:
        return self._user


async def get_current_user(
    request: Request,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
    ] = None,
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    try:
        payload = decode_module_token(credentials.credentials)
    except Exception:
        logger.warning("Token decode failed", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired module token",
        )

    if payload.get("type") != "module_access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )
    if payload.get("module") != "diario":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token not valid for this module",
        )

    user_id = uuid.UUID(payload["sub"])
    organization_id = uuid.UUID(payload["organization_id"])
    roles = payload.get("roles", [])

    result = await db.execute(
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
    )
    user = result.scalar_one_or_none()

    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    return CurrentUser(user_id=user_id, organization_id=organization_id, roles=roles, user=user)


def require_roles(*roles: str):
    async def _check(current: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not any(r in current.roles for r in roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current
    return _check


def get_client_info(request: Request) -> dict:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "unknown"
    return {"ip_address": ip, "user_agent": request.headers.get("user-agent", "")}
