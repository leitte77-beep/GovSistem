import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.permissions import PERFIS, Perm, default_permissions_for_role, perfil_efetivo
from app.core.security import decode_saas_token, decode_token
from app.models.auth_models import Role, User, UserRole

bearer_scheme = HTTPBearer(auto_error=False)

MODULO = "govtask"


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
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal key"
        )


async def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
    ] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado"
        )
    try:
        payload = decode_token(credentials.credentials)
    except Exception:
        payload = decode_saas_token(credentials.credentials) or {}
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido ou expirado"
        )

    token_type = payload.get("type")
    if token_type == "module_access" and payload.get("module") != MODULO:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de outro módulo"
        )
    if token_type not in {"access", "module_access"}:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Tipo de token inválido"
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Payload de token inválido"
        )

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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Usuário inativo"
        )
    if not user.ativo_govtask:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seu acesso ao GovTask foi desativado. Fale com o administrador.",
        )
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário não associado a uma organização",
        )
    # Resolve papéis e permissões agora, com as relações ainda carregadas.
    # Um refresh posterior (populate_existing) expira `user_roles`; sem o
    # cache, ler de novo dispararia um lazy load e, em sessão assíncrona,
    # estouraria com MissingGreenlet.
    get_user_permissions(user)
    get_user_roles(user)
    # Último acesso, gravado no máximo a cada 10 minutos por pessoa.
    agora = datetime.now(timezone.utc)
    ultimo = user.ultimo_acesso
    if ultimo is not None and ultimo.tzinfo is None:
        ultimo = ultimo.replace(tzinfo=timezone.utc)
    if ultimo is None or agora - ultimo > timedelta(minutes=10):
        await db.execute(update(User).where(User.id == user.id).values(ultimo_acesso=agora))
        await db.commit()
        user.__dict__["ultimo_acesso"] = agora
    return user


# Chaves guardadas no __dict__ da instância: sobrevivem ao populate_existing,
# que só repovoa atributos mapeados.
_CACHE_PERMISSOES = "_permissoes_resolvidas"
_CACHE_PAPEIS = "_papeis_resolvidos"


def _resolver_permissoes(user: User) -> set[str]:
    perfil = user.__dict__.get("perfil_govtask")
    papeis = {ur.role.name for ur in user.user_roles}
    if perfil in PERFIS:
        # Perfil definido no módulo substitui os papéis da plataforma; quem é
        # ADMIN lá continua administrando o módulo.
        perms = default_permissions_for_role(perfil)
        if "ADMIN" in papeis:
            perms.add(Perm.ADMIN)
        return perms
    perms: set[str] = set()
    for ur in user.user_roles:
        configuradas = {rp.permission for rp in ur.role.permissions}
        perms |= configuradas or default_permissions_for_role(ur.role.name)
    return perms


def get_perfil(user: User) -> str:
    return perfil_efetivo(
        user.__dict__.get("perfil_govtask"), get_user_roles(user), get_user_permissions(user)
    )


def get_user_permissions(user: User) -> set[str]:
    cache = user.__dict__.get(_CACHE_PERMISSOES)
    if cache is None:
        cache = _resolver_permissoes(user)
        user.__dict__[_CACHE_PERMISSOES] = cache
    return set(cache)


def get_user_roles(user: User) -> set[str]:
    cache = user.__dict__.get(_CACHE_PAPEIS)
    if cache is None:
        cache = {ur.role.name for ur in user.user_roles}
        user.__dict__[_CACHE_PAPEIS] = cache
    return set(cache)


def require_permission(*permissions: str):
    async def _check(user: User = Depends(get_current_user)) -> User:
        if not get_user_permissions(user).intersection(permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Permissões insuficientes"
            )
        return user

    return _check


def get_client_info(request: Request) -> dict:
    forwarded = request.headers.get("x-forwarded-for")
    ip = (
        forwarded.split(",")[0].strip()
        if forwarded
        else (request.client.host if request.client else "unknown")
    )
    return {"ip_address": ip, "user_agent": request.headers.get("user-agent", "")}
