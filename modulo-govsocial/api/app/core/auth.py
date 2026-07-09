import logging
import uuid
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_token
from app.models.enums import RoleName
from app.models.user import User
from app.models.user_role import UserRole

logger = logging.getLogger(__name__)

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


async def get_current_user(
    request: Request,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
    ] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    try:
        payload = decode_token(credentials.credentials)
    except Exception:
        saas_secret = settings.SAAS_JWT_SECRET.get_secret_value()
        if saas_secret:
            try:
                import jwt as _jwt

                payload = _jwt.decode(
                    credentials.credentials,
                    saas_secret,
                    algorithms=[settings.ALGORITHM],
                )
            except Exception:
                logger.warning("Token decode failed", exc_info=True)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired token",
                )
        else:
            logger.warning("Token decode failed", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )

    token_type = payload.get("type")
    if token_type == "module_access" and payload.get("module") != "govsocial":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid module token",
        )
    if token_type not in {"access", "module_access"}:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(
        select(User)
        .where(User.id == uuid.UUID(user_id))
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
    )
    user = result.scalar_one_or_none()

    if user is None or user.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )

    return user


def user_role_names(user: User) -> set[str]:
    return {ur.role.name for ur in user.user_roles}


def require_roles(*roles: str):
    async def _check(user: User = Depends(get_current_user)) -> User:
        if user_role_names(user).intersection(roles):
            return user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )

    return _check


def get_tenant_id(user: User = Depends(get_current_user)) -> uuid.UUID:
    """Multi-tenancy (camada de aplicação): resolve o tenant do usuário.

    Toda query de negócio DEVE filtrar por este tenant_id. Usuários sem tenant
    (exceto ADMIN de plataforma) são rejeitados — fail-closed.
    """
    if user.organization_id is None:
        if RoleName.ADMIN.value in user_role_names(user):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admin de plataforma deve operar no contexto de um tenant",
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário sem tenant associado",
        )
    return user.organization_id


def get_client_info(request: Request) -> dict:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "unknown"
    return {
        "ip_address": ip,
        "user_agent": request.headers.get("user-agent", ""),
        "origin": request.headers.get("origin", ""),
        "request_id": request.headers.get("x-request-id"),
    }
