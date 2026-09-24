"""Autenticação/SSO — espelho do ChatGov (token emitido pelo SaaS).

O login é SEMPRE delegado à plataforma GovSistem. Aqui:
- validamos o token contra a LISTA de segredos (local + chaves do SaaS);
- aceitamos `type ∈ {access, module_access}` sem gate de `module` (igual ChatGov);
- resolvemos o tenant a partir de `organization_id` (fail-closed);
- recarregamos perfil/situação do banco local a cada request (revogação imediata);
- provisionamos just-in-time tenant+usuário se o sync do SaaS não rodou.
"""

import hmac
import logging
import uuid
from typing import Annotated, Optional

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_token
from app.models.cidadao import UsuarioExterno
from app.models.enums import RoleName
from app.models.organization import Organization
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False)

_GOVPRO_ROLE_NAMES = {r.value for r in RoleName}


async def require_internal_key(
    x_internal_key: Annotated[Optional[str], Header()] = None,
) -> None:
    internal_key = settings.INTERNAL_API_KEY.get_secret_value()
    if not internal_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Internal API not configured",
        )
    if not x_internal_key or not hmac.compare_digest(x_internal_key, internal_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal key",
        )


def _map_saas_roles(roles: list[str]) -> set[str]:
    """Papéis SaaS → perfis GovPro (mesma ideia do ChatGov, porém perfis finos)."""
    mapped: set[str] = set()
    for r in roles or []:
        if r in _GOVPRO_ROLE_NAMES:
            mapped.add(r)
        elif r in ("PLATFORM_ADMIN", "ADMIN"):
            mapped.add(RoleName.ADMIN.value)
        elif r == "ORG_MEMBER":
            mapped.add(RoleName.SERVIDOR.value)
    return mapped


async def _ensure_roles_for_user(db: AsyncSession, user_id: uuid.UUID, names: set[str]) -> None:
    if not names:
        return
    result = await db.execute(select(Role).where(Role.name.in_(names)))
    roles = result.scalars().all()
    for role in roles:
        exists = await db.execute(
            select(UserRole).where(UserRole.user_id == user_id, UserRole.role_id == role.id)
        )
        if exists.scalar_one_or_none() is None:
            db.add(UserRole(user_id=user_id, role_id=role.id))


async def _provisionar_just_in_time(db: AsyncSession, payload: dict) -> User:
    """Cria org + usuário a partir do token, caso o sync do SaaS não tenha rodado."""
    user_id = uuid.UUID(payload["sub"])
    org_id = payload.get("organization_id") or payload.get("tenantId") or payload.get("tenant_id")
    org_uuid = uuid.UUID(org_id) if org_id else None

    if org_uuid:
        org = await db.get(Organization, org_uuid)
        if org is None:
            db.add(
                Organization(
                    id=org_uuid,
                    name=payload.get("org_name") or "Órgão",
                    slug=payload.get("org_slug") or f"org-{org_uuid.hex[:12]}",
                )
            )

    name = payload.get("name") or payload.get("nome") or "Usuário"
    email = (payload.get("email") or "").lower() or f"{user_id}@govpro.local"
    user = User(
        id=user_id,
        organization_id=org_uuid,
        name=name,
        email=email,
        is_active=True,
        password_hash=None,  # SSO, sem senha local
    )
    db.add(user)
    await db.flush()
    await _ensure_roles_for_user(db, user.id, _map_saas_roles(payload.get("roles") or []))
    await db.commit()
    return user


async def get_current_user(
    request: Request,
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer_scheme)] = None,
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
        logger.warning("Token decode failed", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    if payload.get("type") not in ("access", "module_access"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    # Segurança: token de módulo só é aceito se emitido para o GovPro.
    if payload.get("type") == "module_access" and payload.get("module") and payload.get("module") != "govpro":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid module token",
        )

    user_id = payload.get("sub")
    if not user_id:
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

    if user is None:
        await _provisionar_just_in_time(db, payload)
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


# Papéis que podem praticar atos no processo. Auditor é leitura ampla + trilha,
# mas não edita (separação de papéis, §6.1 da especificação).
PAPEIS_ATUANTES = tuple(r.value for r in RoleName if r is not RoleName.AUDITOR)
PAPEIS_LEITURA = tuple(r.value for r in RoleName)

# Papéis autorizados a classificar/desclassificar sigilo e conceder credenciais.
PAPEIS_SIGILO_ADMIN = (
    RoleName.GESTOR_SIGILO.value,
    RoleName.AUTORIDADE_SIGNATARIA.value,
    RoleName.ADMIN.value,
    RoleName.DPO.value,
)

# Papéis autorizados a operar o ciclo arquivístico (transferência, recolhimento,
# eliminação) e a TTD.
PAPEIS_ARQUIVO = (
    RoleName.ARQUIVISTA.value,
    RoleName.ADMIN.value,
)


def get_tenant_id(user: User = Depends(get_current_user)) -> uuid.UUID:
    """Multi-tenancy (fail-closed): toda query de negócio filtra por este tenant."""
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


async def get_current_cidadao(
    request: Request,
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer_scheme)] = None,
    db: AsyncSession = Depends(get_db),
) -> UsuarioExterno:
    """Autenticação da área externa (cidadão) — token próprio (`type=citizen`)."""
    import jwt as _jwt

    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = _jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY.get_secret_value(),
            algorithms=[settings.ALGORITHM],
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )

    if payload.get("type") != "citizen":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload"
        )

    cidadao = await db.get(UsuarioExterno, uuid.UUID(user_id))
    if cidadao is None or cidadao.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado"
        )
    if not cidadao.ativo:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuário inativo")

    return cidadao
