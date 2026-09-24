"""Provisionamento just-in-time de organização e usuário a partir do SaaS.

O GovInfra não tem cadastro próprio de usuário nem tela de criação de conta: no
primeiro acesso com um token válido da plataforma, a organização e o servidor
são criados aqui, junto com a configuração inicial do módulo.
"""

import logging
import re
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissoes import Perfil
from app.models.organizacao import Organizacao, User

logger = logging.getLogger("govinfra.provisionamento")

# Papéis vindos da plataforma → perfil dentro do GovInfra. O que não casar
# entra como "consulta" (somente leitura) — nunca como administrador.
MAPA_PAPEIS = {
    "admin": Perfil.ADMINISTRADOR,
    "administrator": Perfil.ADMINISTRADOR,
    "superadmin": Perfil.ADMINISTRADOR,
    "govinfra_admin": Perfil.ADMINISTRADOR,
    "govinfra_gestor": Perfil.GESTOR,
    "gestor": Perfil.GESTOR,
    "manager": Perfil.GESTOR,
    "secretario": Perfil.GESTOR,
    "govinfra_atendente": Perfil.ATENDENTE,
    "atendente": Perfil.ATENDENTE,
    "govinfra_tecnico": Perfil.TECNICO,
    "tecnico": Perfil.TECNICO,
    "fiscal": Perfil.TECNICO,
    "govinfra_operador": Perfil.OPERADOR,
    "operador": Perfil.OPERADOR,
    "govinfra_motorista": Perfil.MOTORISTA,
    "motorista": Perfil.MOTORISTA,
    "govinfra_combustivel": Perfil.COMBUSTIVEL,
    "govinfra_manutencao": Perfil.MANUTENCAO,
}


def perfil_a_partir_dos_papeis(papeis: Iterable[str]) -> Perfil:
    """Escolhe o perfil mais amplo entre os papéis informados."""
    ordem = [
        Perfil.ADMINISTRADOR,
        Perfil.GESTOR,
        Perfil.TECNICO,
        Perfil.ATENDENTE,
        Perfil.COMBUSTIVEL,
        Perfil.MANUTENCAO,
        Perfil.OPERADOR,
        Perfil.MOTORISTA,
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

        # Carga mínima para o módulo funcionar já no primeiro acesso.
        from app.services.configuracoes import garantir_configuracoes_padrao

        await garantir_configuracoes_padrao(db, organizacao.id)
    else:
        # Mantém o nome sincronizado com a plataforma sem sobrescrever com vazio.
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
        logger.info("Usuário provisionado no GovInfra: %s (%s)", user.nome, user.perfil)
        return user

    # Atualiza os dados de identificação, mas NÃO rebaixa/promove um perfil
    # ajustado manualmente dentro do módulo: se o administrador do GovInfra
    # mudou o perfil aqui, a plataforma não desfaz isso a cada login. A exceção
    # é o administrador vindo da plataforma, que sempre prevalece.
    if nome and user.nome != nome:
        user.nome = nome
    if email and user.email != email:
        user.email = email
    if perfil == Perfil.ADMINISTRADOR and user.perfil != Perfil.ADMINISTRADOR.value:
        user.perfil = Perfil.ADMINISTRADOR.value
    return user
