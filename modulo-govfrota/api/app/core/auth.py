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
from app.core.security import decode_saas_token, decode_token
from app.models.auth_models import Role, User, UserRole
from app.models.motorista import AcessoMotorista, Motorista

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False)
driver_bearer_scheme = HTTPBearer(auto_error=False)


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
    """Usuário administrativo autenticado via token do SaaS (module_access)."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Não autenticado",
        )
    try:
        payload = decode_token(credentials.credentials)
    except Exception:
        # Tokens de SSO (module_access) são assinados pelo GovSistem — decodifica
        # com o segredo do SaaS quando o segredo local não validar.
        payload = decode_saas_token(credentials.credentials) or {}
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
        )

    token_type = payload.get("type")
    if token_type == "module_access" and payload.get("module") != "govfrota":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid module token")
    if token_type not in {"access", "module_access"}:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tipo de token inválido")

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Payload de token inválido")

    result = await db.execute(
        select(User)
        .where(User.id == uuid.UUID(user_id))
        .options(
            selectinload(User.user_roles)
            .selectinload(UserRole.role)
            .selectinload(Role.permissions)
        )
    )
    user = result.scalar_one_or_none()

    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuário inativo")
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário não associado a uma organização",
        )

    return user


def get_user_permissions(user: User) -> set[str]:
    perms: set[str] = set()
    for ur in user.user_roles:
        configuradas = {rp.permission for rp in ur.role.permissions}
        perms |= configuradas or default_permissions_for_role(ur.role.name)
    return perms


def require_permission(*permissions: str):
    async def _check(user: User = Depends(get_current_user)) -> User:
        user_perms = get_user_permissions(user)
        if not user_perms.intersection(permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permissões insuficientes",
            )
        return user

    return _check


async def get_current_motorista(
    request: Request,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(driver_bearer_scheme)
    ] = None,
    db: AsyncSession = Depends(get_db),
) -> Motorista:
    """Motorista autenticado via token próprio da área do motorista.

    Nunca aceita tokens administrativos — perfis são estritamente separados.
    """
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")
    try:
        payload = decode_token(credentials.credentials)
    except Exception:
        logger.warning("Token de motorista inválido", exc_info=True)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão expirada")

    if payload.get("type") != "driver_access":
        # Bloqueia explicitamente qualquer outro tipo de token (admin/SSO).
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Área restrita ao motorista",
        )

    motorista_id = payload.get("sub")
    org_id = payload.get("org")
    if not motorista_id or not org_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Payload inválido")

    result = await db.execute(
        select(Motorista)
        .where(
            Motorista.id == uuid.UUID(motorista_id),
            Motorista.organization_id == uuid.UUID(org_id),
            Motorista.deleted_at.is_(None),
        )
        .options(selectinload(Motorista.acesso))
    )
    motorista = result.scalar_one_or_none()
    if motorista is None or not motorista.ativo:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso desativado")

    acesso = motorista.acesso
    if acesso is None or acesso.bloqueado:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso bloqueado")

    return motorista


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
