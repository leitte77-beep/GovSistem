"""Notificações internas (item 42).

A arquitetura já prevê e-mail, WhatsApp institucional e SMS, mas nenhum serviço
externo é acionado sem credenciais configuradas: o registro é criado com o canal
marcado como pendente, e a integração futura só precisa consumir a fila.
"""

import logging
import uuid
from collections.abc import Iterable
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissoes import Perfil
from app.models.enums import CanalNotificacao, SituacaoNotificacao, TipoNotificacao
from app.models.governanca import Notificacao
from app.models.organizacao import User

logger = logging.getLogger("govinfra.notificacoes")


async def criar(
    db: AsyncSession,
    *,
    organizacao_id: uuid.UUID,
    tipo: TipoNotificacao,
    titulo: str,
    mensagem: str,
    destinatario_id: uuid.UUID | None = None,
    perfil_destino: Perfil | None = None,
    entidade: str | None = None,
    entidade_id: uuid.UUID | None = None,
    link: str | None = None,
    canal: CanalNotificacao = CanalNotificacao.SISTEMA,
) -> Notificacao:
    """Cria uma notificação. Não faz commit — participa da transação da operação."""
    notificacao = Notificacao(
        organizacao_id=organizacao_id,
        destinatario_id=destinatario_id,
        perfil_destino=perfil_destino.value if perfil_destino else None,
        tipo=tipo.value,
        titulo=titulo[:200],
        mensagem=mensagem,
        entidade=entidade,
        entidade_id=entidade_id,
        link=link,
        canal=canal.value,
        envio_externo_status=(
            None if canal == CanalNotificacao.SISTEMA else "pendente_integracao"
        ),
    )
    db.add(notificacao)

    if canal != CanalNotificacao.SISTEMA:
        # Sem credenciais configuradas não há envio — só o registro da intenção.
        logger.info(
            "Notificação para canal externo %s registrada como pendente (tipo=%s)",
            canal.value,
            tipo.value,
        )
    return notificacao


async def para_perfis(
    db: AsyncSession,
    *,
    organizacao_id: uuid.UUID,
    perfis: Iterable[Perfil],
    tipo: TipoNotificacao,
    titulo: str,
    mensagem: str,
    entidade: str | None = None,
    entidade_id: uuid.UUID | None = None,
    link: str | None = None,
) -> int:
    """Notifica todos os usuários ativos dos perfis informados."""
    valores = [p.value for p in perfis]
    usuarios = list(
        (
            await db.execute(
                select(User).where(
                    User.organizacao_id == organizacao_id,
                    User.perfil.in_(valores),
                    User.ativo.is_(True),
                    User.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    for usuario in usuarios:
        await criar(
            db,
            organizacao_id=organizacao_id,
            tipo=tipo,
            titulo=titulo,
            mensagem=mensagem,
            destinatario_id=usuario.id,
            entidade=entidade,
            entidade_id=entidade_id,
            link=link,
        )
    return len(usuarios)


async def nao_lidas(db: AsyncSession, user: User) -> int:
    from sqlalchemy import func, or_

    return (
        await db.scalar(
            select(func.count())
            .select_from(Notificacao)
            .where(
                Notificacao.organizacao_id == user.organizacao_id,
                or_(
                    Notificacao.destinatario_id == user.id,
                    Notificacao.perfil_destino == user.perfil,
                ),
                Notificacao.situacao == SituacaoNotificacao.NAO_LIDA.value,
            )
        )
        or 0
    )


async def marcar_lidas(db: AsyncSession, user: User, ids: list[uuid.UUID] | None = None) -> int:
    from sqlalchemy import or_, update

    condicoes = [
        Notificacao.organizacao_id == user.organizacao_id,
        or_(Notificacao.destinatario_id == user.id, Notificacao.perfil_destino == user.perfil),
        Notificacao.situacao == SituacaoNotificacao.NAO_LIDA.value,
    ]
    if ids:
        condicoes.append(Notificacao.id.in_(ids))

    resultado = await db.execute(
        update(Notificacao)
        .where(*condicoes)
        .values(
            situacao=SituacaoNotificacao.LIDA.value,
            lida_em=datetime.now(timezone.utc),
        )
    )
    return resultado.rowcount or 0
