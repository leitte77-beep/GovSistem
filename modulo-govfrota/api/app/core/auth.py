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
from app.core.permissions import PERFIS_COM_ESCOPO, default_permissions_for_role
from app.core.security import decode_saas_token, decode_token
from app.models.auth_models import Role, User, UserRole, UsuarioAcesso, UsuarioUnidade
from app.models.motorista import Motorista

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

    await carregar_acesso(db, user)
    return user


async def carregar_acesso(db: AsyncSession, user: User) -> None:
    """Anexa ao usuário o perfil local e as secretarias vinculadas (escopo)."""
    acesso = await db.scalar(
        select(UsuarioAcesso).where(
            UsuarioAcesso.user_id == user.id,
            UsuarioAcesso.organization_id == user.organization_id,
        )
    )
    unidades = (
        await db.execute(
            select(UsuarioUnidade.unidade_id).where(
                UsuarioUnidade.user_id == user.id,
                UsuarioUnidade.organization_id == user.organization_id,
            )
        )
    ).scalars().all()
    user.perfil_local = acesso.perfil if acesso else None
    user.cargo_local = acesso.cargo if acesso else None
    user.unidades_vinculadas = frozenset(unidades)


def perfis_efetivos(user: User) -> set[str]:
    """Perfil definido no GovFrota substitui os papéis vindos da plataforma."""
    local = getattr(user, "perfil_local", None)
    if local:
        return {local}
    return {ur.role.name for ur in user.user_roles}


def escopo_unidades(user: User) -> frozenset[uuid.UUID] | None:
    """Secretarias que o usuário pode ver; None = todas.

    Restrito quando o perfil é de secretaria ou quando há secretarias vinculadas.
    Perfil de secretaria sem vínculo devolve conjunto vazio: não vê nada.
    """
    vinculadas = getattr(user, "unidades_vinculadas", frozenset())
    if vinculadas or perfis_efetivos(user) & PERFIS_COM_ESCOPO:
        return frozenset(vinculadas)
    return None


def get_user_permissions(user: User) -> set[str]:
    local = getattr(user, "perfil_local", None)
    if local:
        return default_permissions_for_role(local)
    perms: set[str] = set()
    for ur in user.user_roles:
        configuradas = {rp.permission for rp in ur.role.permissions}
        perms |= configuradas or default_permissions_for_role(ur.role.name)
    return perms


def require_permission(*permissions: str, escopo: bool = False):
    """Exige uma das permissões.

    Falha fechada para usuários restritos a secretarias: só passam nos
    endpoints marcados com `escopo=True`, que filtram os dados pelo escopo.
    """

    async def _check(user: User = Depends(get_current_user)) -> User:
        user_perms = get_user_permissions(user)
        if not user_perms.intersection(permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permissões insuficientes",
            )
        if not escopo and escopo_unidades(user) is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso restrito às secretarias vinculadas ao seu usuário.",
            )
        return user

    return _check


def exigir_no_escopo(user: User, unidade_id: uuid.UUID | None) -> None:
    """404 para registro de outra secretaria — não revela que ele existe."""
    escopo = escopo_unidades(user)
    if escopo is not None and unidade_id not in escopo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro não encontrado.")


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

    # Revogação de sessão: o token embute a versão da credencial vigente no
    # momento do login. Se a credencial foi alterada (login/PIN) ou bloqueada
    # depois, a versão avançou ⇒ a sessão antiga é invalidada (401).
    if payload.get("ver") != acesso.credential_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão expirada. Faça login novamente.",
        )

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


def filtro_escopo(user: User, coluna):
    """Condição SQL que limita `coluna` (unidade_id) ao escopo do usuário."""
    from sqlalchemy import false, true

    escopo = escopo_unidades(user)
    if escopo is None:
        return true()
    return coluna.in_(escopo) if escopo else false()


supplier_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_fornecedor(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(supplier_bearer_scheme)] = None,
    db: AsyncSession = Depends(get_db),
):
    """Acesso do portal do posto. Só aceita token `supplier_access`.

    A cada requisição confere se o acesso, o posto e a versão da credencial
    continuam válidos — bloqueio ou redefinição de senha derrubam a sessão.
    """
    from app.models.acesso_fornecedor import AcessoFornecedor
    from app.models.combustivel import Fornecedor

    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")
    try:
        payload = decode_token(credentials.credentials)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão expirada")
    if payload.get("type") != "supplier_access":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Área restrita ao fornecedor")
    try:
        acesso_id = uuid.UUID(payload["sub"])
        fornecedor_id = uuid.UUID(payload["forn"])
        org_id = uuid.UUID(payload["org"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Payload inválido")

    acesso = await db.scalar(
        select(AcessoFornecedor).where(
            AcessoFornecedor.id == acesso_id,
            AcessoFornecedor.fornecedor_id == fornecedor_id,
            AcessoFornecedor.organization_id == org_id,
        )
    )
    if acesso is None or acesso.bloqueado or acesso.credential_version != payload.get("ver", 0):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão encerrada. Entre novamente.")
    posto = await db.scalar(
        select(Fornecedor).where(
            Fornecedor.id == fornecedor_id,
            Fornecedor.organization_id == org_id,
            Fornecedor.deleted_at.is_(None),
            Fornecedor.ativo.is_(True),
        )
    )
    if posto is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fornecedor inativo.")
    return acesso


async def get_fornecedor_com_senha_definitiva(acesso=Depends(get_current_fornecedor)):
    """Com senha provisória, o portal só permite trocar a senha."""
    if acesso.deve_trocar_senha:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Troque a senha provisória para continuar.")
    return acesso
