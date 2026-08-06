"""Sessão do usuário e pontes de autenticação de desenvolvimento.

Não há login próprio: a identidade vem da plataforma GovSistem. As rotas
`/auth/dev/*` só existem fora de produção, atrás de uma flag explícita, e
respondem 404 quando desligadas.
"""

import logging

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import cliente
from app.core.auth import get_current_user, permissoes_do_usuario
from app.core.config import settings
from app.core.database import get_db
from app.core.errors import AppError, NotFound
from app.core.geo import configuracao_mapa
from app.core.permissoes import ROTULOS_PERFIL, catalogo, mapa_perfis
from app.core.security import create_access_token
from app.models.enums import AcaoAuditoria
from app.models.organizacao import Organizacao, User
from app.services import auditoria
from app.services.provisionamento import (
    ensure_organizacao_provisionada,
    ensure_usuario_provisionado,
)

logger = logging.getLogger("govinfra.auth")

router = APIRouter(prefix="/auth", tags=["Sessão"])


@router.get("/eu", summary="Dados da sessão atual")
async def eu(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """Tudo o que o frontend precisa para montar o menu e esconder botões.

    O que aparece aqui é conveniência visual: a API refaz a verificação de
    permissão em cada operação.
    """
    organizacao = await db.get(Organizacao, user.organizacao_id)
    permissoes = sorted(permissoes_do_usuario(user))
    return {
        "usuario": {
            "id": user.id,
            "nome": user.nome,
            "email": user.email,
            "matricula": user.matricula,
            "cargo": user.cargo,
            "perfil": user.perfil,
            "perfil_rotulo": ROTULOS_PERFIL.get(user.perfil, user.perfil),
            "ativo": user.ativo,
        },
        "organizacao": {
            "id": organizacao.id if organizacao else None,
            "nome": organizacao.nome if organizacao else "",
            "slug": organizacao.slug if organizacao else None,
        },
        "permissoes": permissoes,
        "modulo": {
            "nome": "GovInfra",
            "descricao": (
                "Gestão dos serviços, equipamentos e atendimentos da "
                "Secretaria Municipal de Infraestrutura"
            ),
            "versao": settings.VERSION,
        },
        "mapa": configuracao_mapa(),
        "municipio": {"nome": settings.MUNICIPIO_NOME, "uf": settings.MUNICIPIO_UF},
    }


@router.get("/permissoes/catalogo", summary="Catálogo de permissões e perfis")
async def catalogo_permissoes(user: User = Depends(get_current_user)):
    return {"areas": catalogo(), "perfis": mapa_perfis()}


class SessaoDev(BaseModel):
    access_token: str


@router.post(
    "/dev/session",
    summary="Ponte de sessão para desenvolvimento",
    include_in_schema=False,
)
async def sessao_dev(
    dados: SessaoDev, request: Request, db: AsyncSession = Depends(get_db)
):
    """Troca um token do GovSistem por uma sessão local.

    Existe apenas para o desenvolvimento local, onde o módulo roda fora do
    portal. Valida a identidade na API da plataforma antes de abrir a sessão.
    """
    if not settings.ENABLE_DEV_SAAS_AUTH or settings.is_production:
        raise NotFound()

    if not settings.SAAS_API_URL:
        raise AppError(
            "SAAS_API_URL não configurado — a ponte de desenvolvimento precisa dela.",
            503,
            "integracao_indisponivel",
        )

    import httpx

    try:
        async with httpx.AsyncClient(timeout=10) as http:
            resposta = await http.get(
                f"{settings.SAAS_API_URL.rstrip('/')}/auth/me",
                headers={"Authorization": f"Bearer {dados.access_token}"},
            )
    except Exception:
        raise AppError(
            "Não foi possível falar com a plataforma GovSistem.", 503, "plataforma_indisponivel"
        )

    if resposta.status_code != 200:
        raise AppError("Sessão inválida na plataforma.", status.HTTP_401_UNAUTHORIZED, "nao_autenticado")

    perfil_saas = resposta.json()
    organizacao_id = (
        perfil_saas.get("organization_id")
        or perfil_saas.get("tenantId")
        or (perfil_saas.get("organization") or {}).get("id")
    )
    if not organizacao_id:
        raise AppError("A conta não está vinculada a nenhuma organização.", 422, "sem_organizacao")

    # A plataforma nem sempre envia `roles` no /auth/me; nesta ponte (somente
    # desenvolvimento) derivamos o papel do administrador da plataforma para
    # que o perfil provisionado no GovInfra seja útil para demonstrações.
    papeis = list(perfil_saas.get("roles") or [])
    if not papeis:
        if perfil_saas.get("is_platform_admin") or (perfil_saas.get("platform_role") or "").lower() in {
            "super_admin", "superadmin", "admin"
        }:
            papeis = ["admin"]

    await ensure_organizacao_provisionada(
        db,
        organizacao_externa_id=str(organizacao_id),
        nome=(perfil_saas.get("organization") or {}).get("name") or perfil_saas.get("org_name") or "",
        slug=(perfil_saas.get("organization") or {}).get("slug") or "",
    )
    user = await ensure_usuario_provisionado(
        db,
        usuario_externo_id=str(perfil_saas.get("id") or perfil_saas.get("sub")),
        organizacao_externa_id=str(organizacao_id),
        nome=perfil_saas.get("name") or perfil_saas.get("full_name") or "",
        email=perfil_saas.get("email") or "",
        papeis=papeis,
    )
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.LOGIN,
        usuario=user,
        entidade="sessao",
        detalhe="Sessão aberta pela ponte de desenvolvimento",
        cliente=cliente(request),
    )
    await db.commit()

    return {
        "token": create_access_token(str(user.id), extra={"perfil": user.perfil}),
        "usuario": {"id": user.id, "nome": user.nome, "perfil": user.perfil},
    }
