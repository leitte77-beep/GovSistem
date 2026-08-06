"""Dependências de autenticação.

O login vem da plataforma SaaS (GovSistem): o token `module_access` com
`module=govdoc` é validado pelo segredo do SaaS e a organização e o usuário são
provisionados just-in-time (mesmo padrão do ChatGov). Tokens emitidos pelo
próprio GovDoc (`type=access`, usados nos testes e na ponte dev) continuam
aceitos.
"""

import logging
import uuid
from typing import Annotated, Optional

from fastapi import Depends, Header, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.errors import AppError, PermissionDenied
from app.core.security import decode_token
from app.models.enums import Profile
from app.models.user import User
from app.services.provisioning import (
    ensure_institution_provisioned,
    ensure_user_provisioned,
)

logger = logging.getLogger("govdoc.auth")

bearer_scheme = HTTPBearer(auto_error=False)


class Unauthenticated(AppError):
    def __init__(self, message: str = "Sessão não autenticada ou expirada."):
        super().__init__(message, status.HTTP_401_UNAUTHORIZED, "nao_autenticado")


async def require_internal_key(x_internal_key: Annotated[Optional[str], Header()] = None) -> None:
    key = settings.INTERNAL_API_KEY.get_secret_value()
    if not key:
        raise AppError("Integração interna não configurada.", 503, "integracao_indisponivel")
    if x_internal_key != key:
        raise Unauthenticated("Chave interna inválida.")


async def _provision_from_token(db: AsyncSession, payload: dict) -> User:
    """Cria/atualiza organização e usuário a partir dos claims do token SaaS.

    A organização é obrigatória: sem ela o usuário não tem onde operar no
    GovDoc. Reutiliza os mesmos aliases de claims do ChatGov
    (organization_id/tenantId, org_name/tenantName, org_slug/tenantSlug).
    """
    organization_id = (
        payload.get("organization_id")
        or payload.get("tenantId")
        or payload.get("tenant_id")
    )
    if not organization_id:
        raise Unauthenticated("Token sem organização vinculada.")

    subject = payload.get("sub")
    if not subject:
        raise Unauthenticated()

    await ensure_institution_provisioned(
        db,
        organization_id=organization_id,
        name=(
            payload.get("org_name")
            or payload.get("tenantNome")
            or payload.get("tenant_name")
            or ""
        ),
        slug=(
            payload.get("org_slug")
            or payload.get("tenantSlug")
            or payload.get("tenant_slug")
            or ""
        ),
    )

    return await ensure_user_provisioned(
        db,
        user_id=subject,
        organization_id=organization_id,
        name=payload.get("name") or payload.get("nome") or "",
        email=payload.get("email") or "",
        roles=payload.get("roles") or [],
    )


async def get_current_user(
    request: Request,
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials], Depends(bearer_scheme)
    ] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise Unauthenticated()

    try:
        payload = decode_token(credentials.credentials)
    except Exception:
        logger.warning("Falha ao decodificar token")
        raise Unauthenticated()

    token_type = payload.get("type")
    subject = payload.get("sub")
    if not subject:
        raise Unauthenticated()

    if token_type == "module_access":
        if payload.get("module") not in {"govdoc", None}:
            raise Unauthenticated("Token de outro módulo.")
        try:
            user = await _provision_from_token(db, payload)
            await db.commit()
        except Unauthenticated:
            raise
        except Exception:
            logger.exception("Falha ao provisionar acesso via SaaS")
            raise Unauthenticated("Não foi possível validar o acesso na plataforma.")
    elif token_type == "access":
        user = None
        try:
            user = await db.get(User, uuid.UUID(str(subject)))
        except ValueError:
            user = None
        if user is None:
            raise Unauthenticated("Usuário não encontrado.")
    else:
        raise Unauthenticated("Tipo de token inválido.")

    if user.deleted_at is not None:
        raise Unauthenticated("Usuário não encontrado.")
    if not user.is_active:
        raise PermissionDenied("Usuário inativo. Procure o administrador do sistema.")

    request.state.user_id = str(user.id)
    return user


def require_profiles(*profiles: Profile):
    """Guard de perfil — sempre no backend, nunca só escondendo botão."""

    allowed = {p.value for p in profiles}

    async def _check(user: User = Depends(get_current_user)) -> User:
        if user.profile in allowed or user.profile == Profile.ADMIN_GERAL.value:
            return user
        raise PermissionDenied(
            "Seu perfil não permite executar esta operação."
        )

    return _check


require_admin = require_profiles(Profile.ADMIN_GERAL)


def get_client_info(request: Request) -> dict:
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else "desconhecido"
    )
    return {
        "ip_address": ip,
        "user_agent": (request.headers.get("user-agent") or "")[:400],
        "correlation_id": getattr(request.state, "request_id", None),
    }
