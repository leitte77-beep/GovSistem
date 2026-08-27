import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(
    user_id: uuid.UUID,
    roles: list[str],
    organization_id: uuid.UUID | None = None,
    is_platform_admin: bool = False,
    membership_id: uuid.UUID | None = None,
    membership_role: str | None = None,
    permissions_version: int = 1,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "roles": roles,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "organization_id": str(organization_id) if organization_id else None,
        "is_platform_admin": is_platform_admin,
    }
    # Novo modelo multi-tenant (aditivo): claims de membership/tenant.
    if membership_id:
        payload["membership_id"] = str(membership_id)
        payload["active_organization_id"] = str(organization_id) if organization_id else None
        payload["organization_role"] = membership_role or "ORG_MEMBER"
        payload["permissions_version"] = permissions_version
    return jwt.encode(
        payload,
        settings.SECRET_KEY.get_secret_value(),
        algorithm=settings.JWT_ALGORITHM,
    )


def create_refresh_token(user_id: uuid.UUID, jti: uuid.UUID) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "jti": str(jti),
        "type": "refresh",
        "iat": now,
        "exp": now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(
        payload,
        settings.SECRET_KEY.get_secret_value(),
        algorithm=settings.JWT_ALGORITHM,
    )


def create_module_token(
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    roles: list[str],
    module_slug: str,
    name: str | None = None,
    email: str | None = None,
    membership_id: uuid.UUID | None = None,
    module_roles: dict | None = None,
    permissions_version: int = 1,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "organization_id": str(organization_id),
        "roles": roles,
        "module": module_slug,
        "type": "module_access",
        "iss": "govsistem",
        "iat": now,
        "exp": now + timedelta(minutes=settings.MODULE_TOKEN_EXPIRE_MINUTES),
    }
    # Claims novas (aditivas, compatíveis com o modelo multi-tenant):
    if membership_id:
        payload["membership_id"] = str(membership_id)
        payload["active_organization_id"] = str(organization_id)
        payload["target_module"] = module_slug
        payload["permissions_version"] = permissions_version
        # roles namespaced por módulo (apenas o módulo de destino)
        if module_roles is not None:
            payload["module_roles"] = {module_slug: module_roles}
    if name:
        payload["name"] = name
    if email:
        payload["email"] = email
    return jwt.encode(
        payload,
        settings.SECRET_KEY.get_secret_value(),
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_token(token: str) -> dict:
    return jwt.decode(
        token,
        settings.SECRET_KEY.get_secret_value(),
        algorithms=[settings.JWT_ALGORITHM],
    )
