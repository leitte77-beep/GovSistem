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
from app.core.permissions import default_permissions_for_role
from app.core.security import decode_token
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
        # Try SaaS JWT secret as fallback (for SSO module_access tokens)
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
    if token_type == "module_access" and payload.get("module") != "govtask":
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

    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not associated with an organization",
        )

    return user


def get_user_permissions(user: User) -> set[str]:
    """Resolve o conjunto de permissões granulares do usuário a partir das roles.

    Quando uma role não possui nenhuma permissão configurada em
    `role_permissions`, aplica-se o padrão do catálogo — assim uma base ainda
    não migrada continua funcionando, e o administrador segue livre para
    ajustar as permissões de cada role sem alterar código.
    """
    perms: set[str] = set()
    for ur in user.user_roles:
        configuradas = {rp.permission for rp in ur.role.permissions}
        perms |= configuradas or default_permissions_for_role(ur.role.name)
    return perms


def require_permission(*permissions: str):
    """Dependency que exige ao menos uma das permissões granulares (RBAC por recurso).

    Uso: `user: User = Depends(require_permission(Perm.RESOURCE_DELETE))`.
    """
    async def _check(user: User = Depends(get_current_user)) -> User:
        user_perms = get_user_permissions(user)
        if not user_perms.intersection(permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return _check


def get_client_info(request: Request) -> dict:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "unknown"
    return {
        "ip_address": ip,
        "user_agent": request.headers.get("user-agent", ""),
    }
