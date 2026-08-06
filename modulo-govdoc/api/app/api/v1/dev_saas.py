"""Ponte de sessão de desenvolvimento com a plataforma SaaS.

Espelha o `/api/dev/saas` do ChatGov: em ambiente de desenvolvimento o
frontend faz login na API do GovSistem e entrega o `access_token` aqui; o
GovDoc valida a identidade na plataforma (`/auth/me` + `/dashboard`),
provisiona a organização e o usuário just-in-time e devolve um token local.

Sem as flags explícitas (`ENABLE_DEV_SAAS_AUTH` / `ENABLE_DEV_E2E_AUTH`) as
rotas retornam 404 — nunca ativadas no compose de produção.
"""

import logging

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.errors import AppError
from app.core.security import create_access_token, decode_token
from app.models.enums import Profile
from app.models.user import User
from app.schemas.auth import DevSessionRequest
from app.services.provisioning import (
    ensure_institution_provisioned,
    ensure_user_provisioned,
)

logger = logging.getLogger("govdoc.dev_saas")

router = APIRouter(prefix="/auth", tags=["Autenticação (dev)"])


def _rota_disponivel() -> None:
    raise AppError("Rota não encontrada.", 404, "nao_encontrado")


@router.post("/dev/session")
async def dev_session(
    payload: DevSessionRequest,
    db: AsyncSession = Depends(get_db),
):
    if not settings.ENABLE_DEV_SAAS_AUTH:
        _rota_disponivel()

    try:
        decoded = decode_token(payload.access_token)
    except Exception:
        raise AppError("Token do SaaS inválido.", 401, "token_invalido")
    if decoded.get("type") != "access" or not decoded.get("sub"):
        raise AppError("Token do SaaS inválido.", 401, "token_invalido")

    saas_api_url = settings.SAAS_API_URL.rstrip("/")
    if not saas_api_url:
        raise AppError("SAAS_API_URL não configurada.", 503, "integracao_indisponivel")

    headers = {"Authorization": f"Bearer {payload.access_token}"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            me_response = await client.get(f"{saas_api_url}/auth/me", headers=headers)
            if not me_response.ok:
                raise AppError("Sessão do GovSistem inválida.", 401, "sessao_invalida")
            user_data = me_response.json()

            if str(user_data.get("id")) != str(decoded.get("sub")):
                raise AppError("Identidade do GovSistem divergente.", 401, "identidade_divergente")

            dashboard_response = await client.get(f"{saas_api_url}/dashboard", headers=headers)
            if not dashboard_response.ok:
                raise AppError(
                    "Não foi possível confirmar os módulos do usuário.",
                    403,
                    "modulos_indisponiveis",
                )
            dashboard = dashboard_response.json()
            modules = dashboard.get("modules") or []
            if not any(str(m.get("slug")) == "govdoc" for m in modules):
                raise AppError(
                    "Usuário sem permissão para acessar o GovDoc.", 403, "modulo_nao_autorizado"
                )
    except AppError:
        raise
    except Exception as exc:
        logger.warning("Falha ao validar sessão no SaaS: %s", exc)
        raise AppError("Não foi possível validar o acesso no GovSistem.", 401, "sessao_invalida")

    organization_id = user_data.get("organization_id") or decoded.get("organization_id")
    if not organization_id:
        raise AppError("Usuário sem órgão vinculado no GovSistem.", 403, "sem_orgao")

    await ensure_institution_provisioned(
        db,
        organization_id=organization_id,
        name=user_data.get("organization_name") or "",
        slug=user_data.get("organization_slug") or "",
    )
    user = await ensure_user_provisioned(
        db,
        user_id=decoded["sub"],
        organization_id=organization_id,
        name=user_data.get("name") or user_data.get("nome") or "",
        email=user_data.get("email") or "",
        roles=decoded.get("roles") or [],
    )
    await db.commit()

    token = create_access_token(
        str(user.id),
        extra={"perfil": user.profile, "email": user.email},
        token_type="module_access",
    )
    return {
        "token": token,
        "usuario": {
            "id": str(user.id),
            "nome": user.name,
            "email": user.email,
            "perfil": user.profile,
            "organization_id": str(organization_id),
        },
    }


@router.post("/dev/e2e-session")
async def e2e_session(db: AsyncSession = Depends(get_db)):
    """Sessão técnica exclusiva dos testes automatizados do ambiente dev."""
    if not (settings.ENABLE_DEV_SAAS_AUTH and settings.ENABLE_DEV_E2E_AUTH):
        _rota_disponivel()

    user = await db.scalar(
        select(User)
        .where(User.profile == Profile.ADMIN_GERAL.value, User.is_active.is_(True))
        .order_by(User.created_at)
        .limit(1)
    )
    if user is None:
        raise AppError("Administrador DEV não encontrado.", 404, "nao_encontrado")

    token = create_access_token(
        str(user.id),
        extra={"perfil": user.profile, "email": user.email},
        token_type="module_access",
    )
    return {"token": token, "usuario": {"id": str(user.id), "nome": user.name}}
