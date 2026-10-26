"""Termo de uso versionado e aceite (B.12-023)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound, Unprocessable
from app.core.security import agora
from app.models.enums import AcaoAuditoria, StatusTermo
from app.models.nucleo import TermoAceite, TermoUso, Usuario
from app.services.auditoria import registrar
from app.services.configuracoes import valor as valor_config


async def termo_vigente(db: AsyncSession, tenant_id: uuid.UUID) -> TermoUso | None:
    return await db.scalar(
        select(TermoUso)
        .where(
            TermoUso.tenant_id == tenant_id,
            TermoUso.ativo.is_(True),
            TermoUso.vigencia_inicio <= datetime.now(timezone.utc),
        )
        .order_by(TermoUso.vigencia_inicio.desc())
        .limit(1)
    )


async def termo_pendente(db: AsyncSession, usuario: Usuario) -> TermoUso | None:
    obrigatorio = bool(
        await valor_config(db, usuario.tenant_id, "seguranca.termo_obrigatorio", False)
    )
    if not obrigatorio:
        return None
    termo = await termo_vigente(db, usuario.tenant_id)
    if termo is None:
        return None
    if usuario.termo_versao_aceita == termo.versao:
        return None
    aceite = await db.scalar(
        select(TermoAceite).where(
            TermoAceite.tenant_id == usuario.tenant_id,
            TermoAceite.usuario_id == usuario.id,
            TermoAceite.termo_id == termo.id,
        )
    )
    if aceite and aceite.situacao == StatusTermo.ACEITO.value:
        return None
    return termo


async def registrar_aceite(
    db: AsyncSession,
    *,
    usuario: Usuario,
    termo_id: uuid.UUID,
    aceito: bool,
    ip: str | None,
    user_agent: str | None,
    cliente: dict,
) -> TermoAceite:
    termo = await db.scalar(
        select(TermoUso).where(
            TermoUso.id == termo_id, TermoUso.tenant_id == usuario.tenant_id
        )
    )
    if termo is None:
        raise NotFound("Termo de uso não encontrado.")
    vigencia = termo.vigencia_inicio
    if vigencia.tzinfo is None:
        vigencia = vigencia.replace(tzinfo=timezone.utc)
    if vigencia > datetime.now(timezone.utc):
        raise Unprocessable("Este termo ainda não está vigente.")
    aceite = await db.scalar(
        select(TermoAceite).where(
            TermoAceite.tenant_id == usuario.tenant_id,
            TermoAceite.usuario_id == usuario.id,
            TermoAceite.termo_id == termo.id,
        )
    )
    if aceite is None:
        aceite = TermoAceite(
            tenant_id=usuario.tenant_id,
            usuario_id=usuario.id,
            termo_id=termo.id,
            versao=termo.versao,
        )
        db.add(aceite)
    aceite.situacao = StatusTermo.ACEITO.value if aceito else StatusTermo.RECUSADO.value
    aceite.ip = ip
    aceite.user_agent = (user_agent or "")[:400]
    aceite.aceito_em = agora() if aceito else None
    aceite.recusado_em = None if aceito else agora()
    if aceito:
        usuario.termo_versao_aceita = termo.versao
        usuario.termo_aceito_em = agora()
    else:
        # A recusa bloqueia o acesso até nova aceitação.
        usuario.ativo = False
    await registrar(
        db,
        acao=AcaoAuditoria.TERMO,
        usuario=usuario,
        recurso="termo_uso",
        recurso_id=termo.id,
        detalhe="Aceite" if aceito else "Recusa",
        cliente=cliente,
    )
    await db.commit()
    return aceite
