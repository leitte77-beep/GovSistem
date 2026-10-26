"""Autenticação SSO da plataforma e fallback local.

O token ``module_access`` emitido pela saas-platform é validado com
``SAAS_JWT_SECRET`` e só é aceito para ``module == "govsaude"``. O usuário e a
organização são provisionados just-in-time. Tokens locais ``access`` exigem
``token_version`` compatível, permitindo logout/revogação imediata.
"""

from __future__ import annotations

import hmac
import logging
import uuid
from typing import Annotated

from fastapi import Depends, Header, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.errors import AppError, PermissionDenied, Unauthenticated
from app.core.security import agora, decode_token
from app.models.nucleo import Grupo, Usuario, UsuarioGrupo
from app.services.provisionamento import provisionar_organizacao, provisionar_usuario

logger = logging.getLogger("govsaude.auth")
bearer_scheme = HTTPBearer(auto_error=False)


async def require_internal_key(
    x_internal_key: Annotated[str | None, Header(alias="X-Internal-Key")] = None,
) -> None:
    esperado = settings.INTERNAL_API_KEY.get_secret_value()
    if not esperado:
        raise AppError("Integração interna não configurada.", 503, "integracao_indisponivel")
    if not x_internal_key or not hmac.compare_digest(x_internal_key, esperado):
        raise Unauthenticated("Chave interna inválida.")


def _carregar_usuario_stmt():
    return select(Usuario).options(
        selectinload(Usuario.grupos)
        .selectinload(UsuarioGrupo.grupo)
        .selectinload(Grupo.permissoes)
    )


def _org_id(payload: dict) -> str | None:
    valor = (
        payload.get("organization_id")
        or payload.get("active_organization_id")
        or payload.get("tenant_id")
        or payload.get("tenantId")
    )
    return str(valor) if valor else None


async def _provisionar_do_sso(db: AsyncSession, payload: dict) -> Usuario:
    organization_id = _org_id(payload)
    subject = payload.get("sub")
    if not organization_id or not subject:
        raise Unauthenticated("Token sem organização ou usuário.")
    organizacao = await provisionar_organizacao(
        db,
        organization_id=organization_id,
        nome=payload.get("org_name") or payload.get("tenant_name") or "Município",
        slug=payload.get("org_slug") or payload.get("tenant_slug"),
        uf=payload.get("org_uf"),
        municipio_ibge=payload.get("municipio_ibge"),
    )
    roles = payload.get("roles") or payload.get("papeis") or []
    if payload.get("module_roles"):
        roles = list(roles) + list(payload["module_roles"].get("govsaude", []))
    usuario = await provisionar_usuario(
        db,
        user_id=subject,
        organization_id=organizacao.id,
        nome=payload.get("name") or payload.get("nome") or "Servidor",
        email=payload.get("email") or "",
        papeis=roles,
        ativo=True,
    )
    await db.commit()
    return usuario


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
    db: AsyncSession = Depends(get_db),
) -> Usuario:
    if credentials is None:
        raise Unauthenticated()
    try:
        payload = decode_token(credentials.credentials)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Falha ao decodificar token: %s", exc.__class__.__name__)
        raise Unauthenticated() from exc

    tipo = payload.get("type")
    if tipo not in {"access", "module_access"}:
        raise Unauthenticated("Tipo de token inválido.")
    if not payload.get("sub"):
        raise Unauthenticated("Token sem usuário.")

    if tipo == "module_access":
        if payload.get("module") not in {"govsaude", None}:
            raise Unauthenticated("Token emitido para outro módulo.")
        try:
            await _provisionar_do_sso(db, payload)
        except Unauthenticated:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("Falha no provisionamento SSO")
            raise Unauthenticated("Não foi possível validar o acesso na plataforma.") from exc
        chave_sub = str(payload["sub"])
        identidade = Usuario.externo_id == chave_sub
        try:
            identidade = or_(Usuario.id == uuid.UUID(chave_sub), identidade)
        except ValueError:
            pass
        tenant_token = _org_id(payload)
        filtro = identidade
        if tenant_token:
            try:
                filtro = and_(Usuario.tenant_id == uuid.UUID(tenant_token), identidade)
            except ValueError:
                pass
        usuario = await db.scalar(_carregar_usuario_stmt().where(filtro))
    else:
        try:
            alvo = uuid.UUID(str(payload["sub"]))
        except ValueError as exc:
            raise Unauthenticated() from exc
        usuario = await db.scalar(_carregar_usuario_stmt().where(Usuario.id == alvo))
        if usuario is None:
            raise Unauthenticated("Usuário não encontrado.")
        if int(payload.get("ver", 0) or 0) != int(usuario.token_version):
            raise Unauthenticated("Sessão revogada. Entre novamente.")

    if usuario is None or usuario.baixa_em is not None:
        raise Unauthenticated("Usuário não encontrado.")
    if tipo == "access":
        from app.services.autenticacao import inatividade_excedida

        if inatividade_excedida(usuario):
            raise Unauthenticated("Sessão encerrada por inatividade.")
    if not usuario.ativo:
        raise PermissionDenied("Usuário inativo. Procure o administrador do sistema.")
    bloqueado_ate = usuario.bloqueado_ate
    if bloqueado_ate is not None and bloqueado_ate.tzinfo is None:
        from datetime import timezone

        bloqueado_ate = bloqueado_ate.replace(tzinfo=timezone.utc)
    if bloqueado_ate and bloqueado_ate > agora():
        raise PermissionDenied("Usuário temporariamente bloqueado.")

    # Janela individual + restrições por grupo/estabelecimento valem também
    # para sessões já emitidas (não só no login).
    from app.models.nucleo import Organizacao
    from app.services.autenticacao import validar_janela
    from app.services.janela_acesso import acesso_bloqueado

    organizacao = await db.get(Organizacao, usuario.tenant_id)
    if organizacao is not None and not validar_janela(usuario, organizacao):
        raise PermissionDenied("Acesso fora do horário permitido para este usuário.")
    restricao = await acesso_bloqueado(db, usuario)
    if restricao is not None:
        raise PermissionDenied(
            "Acesso fora do horário permitido pela restrição do grupo/unidade."
        )
    unidade_ref = request.path_params.get("estabelecimento_id") or request.query_params.get(
        "estabelecimento_id"
    )
    if unidade_ref:
        try:
            unidade_id = uuid.UUID(str(unidade_ref))
        except (ValueError, TypeError):
            unidade_id = None
        if unidade_id is not None:
            restricao_unidade = await acesso_bloqueado(
                db, usuario, estabelecimento_id=unidade_id
            )
            if restricao_unidade is not None:
                raise PermissionDenied(
                    "Acesso fora do horário permitido para esta unidade."
                )

    request.state.user_id = str(usuario.id)
    request.state.tenant_id = str(usuario.tenant_id)
    request.state.grupos = [ug.grupo.codigo for ug in usuario.grupos if ug.ativo and ug.grupo]
    return usuario


def get_tenant_id(usuario: Usuario = Depends(get_current_user)) -> uuid.UUID:
    """Fail-closed: sem tenant não há acesso a dado de negócio."""
    if usuario is None or usuario.tenant_id is None:
        raise AppError(
            "Usuário sem organização vinculada.",
            status.HTTP_403_FORBIDDEN,
            "sem_tenant",
        )
    return usuario.tenant_id


def tenant_de(user: Usuario) -> uuid.UUID:
    if user.tenant_id is None:
        raise AppError("Usuário sem tenant.", 403, "sem_tenant")
    return user.tenant_id


def grupos_do_usuario(usuario: Usuario) -> list[str]:
    return [ug.grupo.codigo for ug in usuario.grupos if ug.ativo and ug.grupo]


