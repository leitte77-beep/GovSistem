"""Provisionamento just-in-time de organização e usuário a partir do SaaS.

O GovCompras não tem cadastro próprio de usuário nem tela de criação de conta
para o fluxo real: no primeiro acesso com um token `module_access` válido da
plataforma GovSistem, a organização e o servidor são criados aqui. A exceção é
a ponte de login de demonstração (`app/services/dev_auth.py`), usada só fora
de produção para navegar a POC com as personas fictícias da seção 128.
"""

import logging
import re
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissoes import Perfil
from app.models.organizacao import Organizacao, User

logger = logging.getLogger("govcompras.provisionamento")

# Papéis vindos da plataforma → perfil dentro do GovCompras. O que não casar
# entra como "consulta" (somente leitura) — nunca como administrador.
MAPA_PAPEIS = {
    "admin": Perfil.ADMINISTRADOR,
    "administrator": Perfil.ADMINISTRADOR,
    "superadmin": Perfil.ADMINISTRADOR,
    "govcompras_admin": Perfil.ADMINISTRADOR,
    "govcompras_solicitante": Perfil.SOLICITANTE,
    "solicitante": Perfil.SOLICITANTE,
    "secretario": Perfil.SOLICITANTE,
    "govcompras_compras": Perfil.COMPRAS,
    "compras": Perfil.COMPRAS,
    "govcompras_licitacao": Perfil.LICITACAO,
    "licitacao": Perfil.LICITACAO,
    "govcompras_contabilidade": Perfil.CONTABILIDADE,
    "contabilidade": Perfil.CONTABILIDADE,
    "govcompras_juridico": Perfil.JURIDICO,
    "juridico": Perfil.JURIDICO,
    "govcompras_fiscal": Perfil.FISCAL,
    "fiscal": Perfil.FISCAL,
}


def perfil_a_partir_dos_papeis(papeis: Iterable[str]) -> Perfil:
    """Escolhe o perfil mais amplo entre os papéis informados pela plataforma."""
    ordem = [
        Perfil.ADMINISTRADOR,
        Perfil.COMPRAS,
        Perfil.LICITACAO,
        Perfil.CONTABILIDADE,
        Perfil.JURIDICO,
        Perfil.FISCAL,
        Perfil.SOLICITANTE,
        Perfil.CONSULTA,
    ]
    encontrados = {
        MAPA_PAPEIS[str(papel).strip().lower()]
        for papel in (papeis or [])
        if str(papel).strip().lower() in MAPA_PAPEIS
    }
    for perfil in ordem:
        if perfil in encontrados:
            return perfil
    return Perfil.CONSULTA


def _slug(texto: str) -> str:
    limpo = re.sub(r"[^a-z0-9]+", "-", (texto or "").lower()).strip("-")
    return limpo[:120] or "organizacao"


async def ensure_organizacao_provisionada(
    db: AsyncSession, *, organizacao_externa_id: str, nome: str, slug: str
) -> Organizacao:
    organizacao = await db.scalar(
        select(Organizacao).where(Organizacao.externo_id == str(organizacao_externa_id))
    )
    if organizacao is None:
        organizacao = Organizacao(
            externo_id=str(organizacao_externa_id),
            nome=nome or "Prefeitura",
            slug=slug or _slug(nome),
        )
        db.add(organizacao)
        await db.flush()
        logger.info("Organização provisionada: %s", organizacao.nome)
    else:
        if nome and organizacao.nome != nome:
            organizacao.nome = nome
        if slug and organizacao.slug != slug:
            organizacao.slug = slug
    return organizacao


async def ensure_usuario_provisionado(
    db: AsyncSession,
    *,
    usuario_externo_id: str,
    organizacao_externa_id: str,
    nome: str,
    email: str,
    papeis: Iterable[str],
) -> User:
    organizacao = await db.scalar(
        select(Organizacao).where(Organizacao.externo_id == str(organizacao_externa_id))
    )
    if organizacao is None:  # pragma: no cover - garantido pelo chamador
        raise ValueError("Organização não provisionada")

    user: User | None = await db.scalar(
        select(User).where(
            User.organizacao_id == organizacao.id,
            User.externo_id == str(usuario_externo_id),
        )
    )

    perfil = perfil_a_partir_dos_papeis(papeis)

    if user is None:
        user = User(
            organizacao_id=organizacao.id,
            externo_id=str(usuario_externo_id),
            nome=nome or email or "Servidor",
            email=email or "",
            perfil=perfil.value,
        )
        db.add(user)
        await db.flush()
        logger.info("Usuário provisionado no GovCompras: %s (%s)", user.nome, user.perfil)
        return user

    if nome and user.nome != nome:
        user.nome = nome
    if email and user.email != email:
        user.email = email
    if perfil == Perfil.ADMINISTRADOR and user.perfil != Perfil.ADMINISTRADOR.value:
        user.perfil = Perfil.ADMINISTRADOR.value
    return user
