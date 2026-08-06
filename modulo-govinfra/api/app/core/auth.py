"""Autenticação e autorização.

O login vem da plataforma SaaS (GovSistem): o token `module_access` com
`module=govinfra` é validado pelo segredo compartilhado e a organização e o
usuário são provisionados na hora (mesmo padrão do ChatGov e do GovDoc). Tokens
emitidos pelo próprio GovInfra (`type=access`, usados na suíte de testes e na
ponte de desenvolvimento) continuam aceitos.

Nada de sistema de login próprio: o GovInfra não guarda senha de servidor nem
duplica cadastro de usuário.
"""

import logging
import uuid
from collections.abc import Iterable
from typing import Annotated

from fastapi import Depends, Header, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.errors import AppError, PermissionDenied
from app.core.permissoes import P, Perfil, permissoes_efetivas
from app.core.security import decode_token
from app.models.organizacao import User
from app.services.provisionamento import (
    ensure_organizacao_provisionada,
    ensure_usuario_provisionado,
)

logger = logging.getLogger("govinfra.auth")

bearer_scheme = HTTPBearer(auto_error=False)


class Unauthenticated(AppError):
    def __init__(self, message: str = "Sessão não autenticada ou expirada."):
        super().__init__(message, status.HTTP_401_UNAUTHORIZED, "nao_autenticado")


async def require_internal_key(x_internal_key: Annotated[str | None, Header()] = None) -> None:
    """Protege as rotas internas (integração servidor-a-servidor)."""
    chave = settings.INTERNAL_API_KEY.get_secret_value()
    if not chave:
        raise AppError("Integração interna não configurada.", 503, "integracao_indisponivel")
    if x_internal_key != chave:
        raise Unauthenticated("Chave interna inválida.")


async def _provisionar_do_token(db: AsyncSession, payload: dict) -> User:
    """Cria/atualiza organização e usuário a partir dos claims do token do SaaS."""
    organizacao_id = (
        payload.get("organization_id") or payload.get("tenantId") or payload.get("tenant_id")
    )
    if not organizacao_id:
        raise Unauthenticated("Token sem organização vinculada.")

    subject = payload.get("sub")
    if not subject:
        raise Unauthenticated()

    await ensure_organizacao_provisionada(
        db,
        organizacao_externa_id=str(organizacao_id),
        nome=(payload.get("org_name") or payload.get("tenantNome") or payload.get("tenant_name") or ""),
        slug=(payload.get("org_slug") or payload.get("tenantSlug") or payload.get("tenant_slug") or ""),
    )

    return await ensure_usuario_provisionado(
        db,
        usuario_externo_id=str(subject),
        organizacao_externa_id=str(organizacao_id),
        nome=payload.get("name") or payload.get("nome") or "",
        email=payload.get("email") or "",
        papeis=payload.get("roles") or payload.get("papeis") or [],
    )


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise Unauthenticated()

    try:
        payload = decode_token(credentials.credentials)
    except Exception:
        logger.warning("Falha ao decodificar token")
        raise Unauthenticated()

    tipo = payload.get("type")
    subject = payload.get("sub")
    if not subject:
        raise Unauthenticated()

    if tipo == "module_access":
        if payload.get("module") not in {"govinfra", None}:
            raise Unauthenticated("Token de outro módulo.")
        try:
            user = await _provisionar_do_token(db, payload)
            await db.commit()
        except Unauthenticated:
            raise
        except Exception:
            logger.exception("Falha ao provisionar acesso via plataforma")
            raise Unauthenticated("Não foi possível validar o acesso na plataforma.")
    elif tipo == "access":
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
    if not user.ativo:
        raise PermissionDenied("Usuário inativo. Procure o administrador do sistema.")

    request.state.user_id = str(user.id)
    request.state.perfil = user.perfil
    return user


def permissoes_do_usuario(user: User) -> set[str]:
    return permissoes_efetivas(user.perfil, user.permissoes_extras or [], user.permissoes_revogadas or [])


def usuario_pode(user: User, *permissoes: P | str) -> bool:
    """Checagem sem levantar exceção — usada para decidir mascaramento de dados."""
    efetivas = permissoes_do_usuario(user)
    return all(str(p) in efetivas for p in permissoes)


def exigir(*permissoes: P | str):
    """Dependência que exige TODAS as permissões informadas.

    Usada em cada rota. É a única fonte de verdade da autorização: mesmo que a
    interface já tenha escondido o botão, a API repete a verificação.
    """
    necessarias = [str(p) for p in permissoes]

    async def _verificar(user: User = Depends(get_current_user)) -> User:
        efetivas = permissoes_do_usuario(user)
        faltando = [p for p in necessarias if p not in efetivas]
        if faltando:
            raise PermissionDenied(
                "Seu perfil não permite esta operação. "
                f"Permissão necessária: {', '.join(faltando)}."
            )
        return user

    return _verificar


def exigir_qualquer(*permissoes: P | str):
    """Dependência que exige PELO MENOS UMA das permissões informadas."""
    aceitas = [str(p) for p in permissoes]

    async def _verificar(user: User = Depends(get_current_user)) -> User:
        efetivas = permissoes_do_usuario(user)
        if not any(p in efetivas for p in aceitas):
            raise PermissionDenied(
                "Seu perfil não permite esta operação. "
                f"É necessária uma destas permissões: {', '.join(aceitas)}."
            )
        return user

    return _verificar


def exigir_perfis(*perfis: Perfil):
    aceitos = {p.value for p in perfis}

    async def _verificar(user: User = Depends(get_current_user)) -> User:
        if user.perfil in aceitos or user.perfil == Perfil.ADMINISTRADOR.value:
            return user
        raise PermissionDenied("Seu perfil não permite esta operação.")

    return _verificar


require_admin = exigir_perfis(Perfil.ADMINISTRADOR)


def dados_do_cliente(request: Request) -> dict:
    """IP, dispositivo e correlação — gravados em toda entrada de auditoria."""
    encaminhado = request.headers.get("x-forwarded-for")
    ip = (
        encaminhado.split(",")[0].strip()
        if encaminhado
        else (request.client.host if request.client else "desconhecido")
    )
    return {
        "ip": ip,
        "dispositivo": (request.headers.get("user-agent") or "")[:400],
        "correlacao": getattr(request.state, "request_id", None),
        "origem": request.headers.get("x-origem-app") or "web",
    }


def sem_permissao(user: User, permissoes: Iterable[P | str]) -> bool:
    efetivas = permissoes_do_usuario(user)
    return any(str(p) not in efetivas for p in permissoes)
