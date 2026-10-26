"""Provisionamento just-in-time de organização e usuário a partir do SaaS.

O GovSaúde não tem cadastro paralelo de tenant: organização e usuário chegam
no primeiro acesso (ou por ``/internal/sync-*``). O ID do usuário é preservado
quando o payload traz um UUID, para que os tokens emitidos pela plataforma
continuem válidos.
"""

from __future__ import annotations

import logging
import re
import uuid
from collections.abc import Iterable

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict
from app.core.permissoes import GRUPOS_NACIONAIS, grupos_para_papeis
from app.core.security import hmac_hex
from app.models.nucleo import Grupo, Organizacao, Usuario, UsuarioGrupo
from app.services.seeds import (
    garantir_configuracoes_padrao,
    garantir_grupos_tenant,
    garantir_prioridades_configuraveis,
)

logger = logging.getLogger("govsaude.provisionamento")


def _uuid_ou_novo(valor: str | uuid.UUID | None) -> uuid.UUID:
    if isinstance(valor, uuid.UUID):
        return valor
    try:
        return uuid.UUID(str(valor))
    except (ValueError, TypeError, AttributeError):
        return uuid.uuid4()


def slugificar(texto: str) -> str:
    limpo = re.sub(r"[^a-z0-9]+", "-", (texto or "").lower()).strip("-")
    return (limpo or "organizacao")[:140]


async def provisionar_organizacao(
    db: AsyncSession,
    *,
    organization_id: str | uuid.UUID,
    nome: str,
    slug: str | None = None,
    tipo: str = "MUNICIPIO",
    cnpj: str | None = None,
    uf: str | None = None,
    municipio_ibge: str | None = None,
    fuso_horario: str = "America/Sao_Paulo",
    ativa: bool = True,
) -> Organizacao:
    tenant_id = _uuid_ou_novo(organization_id)
    externo = str(organization_id)
    organizacao = await db.scalar(
        select(Organizacao).where(
            (Organizacao.id == tenant_id) | (Organizacao.externo_id == externo)
        )
    )
    if organizacao is None:
        organizacao = Organizacao(
            id=tenant_id,
            externo_id=externo,
            nome=nome or "Município",
            slug=slug or slugificar(nome),
            tipo=tipo,
            cnpj_normalizado=_normalizar_cnpj(cnpj),
            cnpj_hash=hmac_hex(cnpj) if cnpj else None,
            uf=uf,
            municipio_ibge=municipio_ibge,
            fuso_horario=fuso_horario or "America/Sao_Paulo",
            ativa=ativa,
        )
        db.add(organizacao)
        await db.flush()
        logger.info("Organização provisionada: %s", organizacao.nome)
    else:
        if organizacao.externo_id != externo:
            organizacao.externo_id = externo
        if nome:
            organizacao.nome = nome
        if slug:
            organizacao.slug = slug
        if cnpj:
            organizacao.cnpj_normalizado = _normalizar_cnpj(cnpj)
            organizacao.cnpj_hash = hmac_hex(cnpj)
        if uf:
            organizacao.uf = uf
        if municipio_ibge:
            organizacao.municipio_ibge = municipio_ibge
        if fuso_horario:
            organizacao.fuso_horario = fuso_horario
        organizacao.ativa = ativa
    await garantir_grupos_tenant(db, organizacao.id)
    await garantir_configuracoes_padrao(db, organizacao.id)
    await garantir_prioridades_configuraveis(db, organizacao.id)
    return organizacao


def _normalizar_cnpj(cnpj: str | None) -> str | None:
    if not cnpj:
        return None
    return "".join(ch for ch in cnpj.upper() if ch.isalnum())


def _email_unico(db: AsyncSession, tenant_id: uuid.UUID, email: str, user_id: uuid.UUID) -> str:
    base = (email or "").strip().lower()
    if base:
        return base
    return f"{user_id}@govsaude.local"


async def provisionar_usuario(
    db: AsyncSession,
    *,
    user_id: str | uuid.UUID,
    organization_id: str | uuid.UUID,
    nome: str,
    email: str = "",
    papeis: Iterable[str] | None = None,
    ativo: bool = True,
) -> Usuario:
    tenant = await db.scalar(
        select(Organizacao).where(
            (Organizacao.id == _uuid_ou_novo(organization_id))
            | (Organizacao.externo_id == str(organization_id))
        )
    )
    if tenant is None:
        raise Conflict(
            "Organização não provisionada para o usuário.",
            code="organizacao_ausente",
        )

    alvo_id = _uuid_ou_novo(user_id)
    usuario = await db.scalar(select(Usuario).where(Usuario.id == alvo_id))
    if usuario is not None and usuario.tenant_id != tenant.id:
        raise Conflict(
            "Usuário já vinculado a outro tenant.",
            code="usuario_outro_tenant",
        )
    if usuario is None:
        usuario = await db.scalar(
            select(Usuario).where(
                Usuario.tenant_id == tenant.id,
                Usuario.externo_id == str(user_id),
            )
        )
    if usuario is None and email:
        usuario = await db.scalar(
            select(Usuario).where(
                Usuario.tenant_id == tenant.id,
                Usuario.email == email.lower(),
            )
        )
        if usuario is not None:
            usuario.externo_id = str(user_id)
    if usuario is None:
        usuario = Usuario(
            id=alvo_id,
            tenant_id=tenant.id,
            externo_id=str(user_id),
            nome=nome or "Servidor",
            email=_email_unico(db, tenant.id, email, alvo_id),
            ativo=ativo,
        )
        db.add(usuario)
        await db.flush()
        logger.info("Usuário provisionado no GovSaúde: %s", usuario.nome)
    else:
        if nome:
            usuario.nome = nome
        if email:
            usuario.email = email.lower()
        usuario.ativo = ativo

    await _sincronizar_grupos(db, usuario, list(papeis or []))
    return usuario


async def _sincronizar_grupos(db: AsyncSession, usuario: Usuario, papeis: list[str]) -> None:
    codigos = grupos_para_papeis(papeis)
    grupos = (
        await db.execute(
            select(Grupo).where(
                Grupo.tenant_id == usuario.tenant_id,
                Grupo.codigo.in_(codigos),
            )
        )
    ).scalars().all()
    if not grupos:
        grupos = (
            await db.execute(
                select(Grupo).where(
                    Grupo.tenant_id == usuario.tenant_id,
                    Grupo.codigo == "consulta_gestao",
                )
            )
        ).scalars().all()
    else:
        from app.services.configuracoes import valor as valor_config

        consentimento = bool(
            await valor_config(
                db, usuario.tenant_id, "suporte.consentimento", False
            )
        )
        grupos = [
            grupo
            for grupo in grupos
            if not grupo.requer_consentimento or consentimento
        ]
        if not grupos:
            grupos = (
                await db.execute(
                    select(Grupo).where(
                        Grupo.tenant_id == usuario.tenant_id,
                        Grupo.codigo == "consulta_gestao",
                    )
                )
            ).scalars().all()

    # Remove apenas vínculos automáticos de grupos de sistema; escopos
    # definidos manualmente (estabelecimento/equipe) são preservados.
    await db.execute(
        delete(UsuarioGrupo).where(
            UsuarioGrupo.usuario_id == usuario.id,
            UsuarioGrupo.ativo.is_(True),
            UsuarioGrupo.estabelecimento_id.is_(None),
            UsuarioGrupo.equipe_id.is_(None),
        )
    )
    existentes = {
        ug.grupo_id
        for ug in (
            await db.execute(
                select(UsuarioGrupo).where(
                    UsuarioGrupo.usuario_id == usuario.id,
                    UsuarioGrupo.ativo.is_(True),
                )
            )
        ).scalars()
    }
    for grupo in grupos:
        if grupo.id in existentes:
            continue
        db.add(UsuarioGrupo(tenant_id=usuario.tenant_id, usuario_id=usuario.id, grupo_id=grupo.id))
    await db.flush()


def grupos_do_payload_legado() -> set[str]:
    """Compatibilidade com payloads que mandam apenas ``ADMIN``/``ORG_MEMBER``."""
    return set(GRUPOS_NACIONAIS)
