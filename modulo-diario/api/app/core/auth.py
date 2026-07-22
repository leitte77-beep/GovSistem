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
from app.models.organization import Organization
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False)

DIARIO_ROLES = {
    "ADMIN",
    "AUTOR",
    "REVISOR",
    "DIAGRAMADOR",
    "ASSINADOR",
    "PUBLICADOR",
    "AUDITOR",
}


def _map_platform_roles(platform_roles: list[str]) -> set[str]:
    roles = set(platform_roles)
    result = roles & DIARIO_ROLES
    if roles & {"SUPER_ADMIN", "PLATFORM_ADMIN"}:
        result.add("ADMIN")
    if result:
        return result
    if roles & {"SUPPORT"}:
        return {"ADMIN"}
    return {"AUTOR"}


async def _ensure_user_from_module_token(
    payload: dict, db: AsyncSession
) -> User:
    user_id = uuid.UUID(payload["sub"])
    org_id_raw = payload.get("organization_id")
    org_id = uuid.UUID(org_id_raw) if org_id_raw else None
    name = payload.get("name", "")
    email = payload.get("email", "")
    platform_roles = payload.get("roles", [])

    if org_id:
        org = await db.get(Organization, org_id)
        if not org:
            org = Organization(
                id=org_id,
                name=name or email,
                slug=f"auto-{org_id.hex[:12]}",
                is_active=True,
            )
            db.add(org)
            await db.flush()

    user = User(
        id=user_id,
        organization_id=org_id,
        name=name or email,
        email=email,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    desired_role_names = _map_platform_roles(platform_roles)
    roles_result = await db.execute(
        select(Role).where(Role.name.in_(desired_role_names))
    )
    for role in roles_result.scalars().all():
        db.add(UserRole(user_id=user.id, role_id=role.id))

    await db.commit()
    await db.refresh(user)

    result = await db.execute(
        select(User)
        .where(User.id == user.id)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
    )
    return result.scalar_one()


async def require_internal_key(
    x_internal_key: Annotated[str | None, Header()] = None,
) -> None:
    internal_key = settings.INTERNAL_API_KEY.get_secret_value()
    saas_internal_key = settings.SAAS_INTERNAL_API_KEY.get_secret_value()
    if not internal_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Internal API not configured",
        )
    valid_keys = {internal_key}
    if saas_internal_key:
        valid_keys.add(saas_internal_key)
    if x_internal_key not in valid_keys:
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
    decoded_with_saas_secret = False
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
                decoded_with_saas_secret = True
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
    if decoded_with_saas_secret and token_type != "module_access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )
    if token_type == "module_access" and payload.get("module") != "diario":
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

    if user is None and token_type == "module_access":
        logger.info(
            "Auto-creating user %s from module_access token", user_id
        )
        user = await _ensure_user_from_module_token(payload, db)

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

    if token_type == "module_access" and payload.get("module") != "diario":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token not valid for this module",
        )

    return user


def require_roles(*roles: str):
    async def _check(user: User = Depends(get_current_user)) -> User:
        user_roles = {ur.role.name for ur in user.user_roles}
        if not user_roles.intersection(roles):
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
