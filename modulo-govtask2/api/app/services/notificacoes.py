"""Notificações in-app: quem faz o quê chega ao sino do Assessor.

O Assessor é o dono do fluxo, então é para ele que vão os avisos de assunção,
transferência, prazo alterado, complemento e devolução. Menções avisam o
usuário mencionado.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.auth_models import Role, User, UserRole
from app.models.notificacao import Notificacao, TipoNotificacao
from app.models.pedido import Encaminhamento, Pedido

PAPEIS_ASSESSOR = ("ASSESSOR", "ADMIN")


async def assessores(db: AsyncSession, organization_id: uuid.UUID) -> list[User]:
    """Usuários que conduzem o fluxo e devem receber os avisos."""
    result = await db.execute(
        select(User)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(
            User.organization_id == organization_id,
            User.is_active.is_(True),
            User.deleted_at.is_(None),
            Role.name.in_(PAPEIS_ASSESSOR),
        )
        .options(selectinload(User.user_roles))
    )
    return list(result.scalars().unique().all())


def criar(
    db: AsyncSession,
    *,
    destinatarios: list[User],
    tipo: TipoNotificacao,
    texto: str,
    pedido: Pedido | None = None,
    encaminhamento: Encaminhamento | None = None,
    autor_nome: str = "",
) -> None:
    """Grava uma notificação por destinatário. Não faz commit."""
    vistos: set[uuid.UUID] = set()
    for user in destinatarios:
        if user is None or user.id in vistos:
            continue
        vistos.add(user.id)
        db.add(
            Notificacao(
                organization_id=user.organization_id,
                user_id=user.id,
                pedido_id=pedido.id if pedido else None,
                encaminhamento_id=encaminhamento.id if encaminhamento else None,
                tipo=tipo.value,
                texto=texto,
                autor_nome=autor_nome,
            )
        )


async def para_assessor(
    db: AsyncSession,
    *,
    pedido: Pedido,
    encaminhamento: Encaminhamento | None,
    tipo: TipoNotificacao,
    texto: str,
    autor: User | None,
) -> None:
    """Avisa quem conduz o fluxo, sem avisar quem gerou o evento."""
    destinatarios = [
        u
        for u in await assessores(db, pedido.organization_id)
        if autor is None or u.id != autor.id
    ]
    criar(
        db,
        destinatarios=destinatarios,
        tipo=tipo,
        texto=texto,
        pedido=pedido,
        encaminhamento=encaminhamento,
        autor_nome=autor.name if autor else "Sistema",
    )


async def listar(
    db: AsyncSession, user: User, *, apenas_nao_lidas: bool = False, limite: int = 40
) -> list[Notificacao]:
    query = select(Notificacao).where(
        Notificacao.user_id == user.id,
        Notificacao.organization_id == user.organization_id,
    )
    if apenas_nao_lidas:
        query = query.where(Notificacao.lida_em.is_(None))
    result = await db.execute(
        query.order_by(Notificacao.created_at.desc()).limit(limite)
    )
    return list(result.scalars().all())


async def contar_nao_lidas(db: AsyncSession, user: User) -> int:
    return int(
        await db.scalar(
            select(func.count(Notificacao.id)).where(
                Notificacao.user_id == user.id,
                Notificacao.lida_em.is_(None),
            )
        )
        or 0
    )


async def marcar_lidas(
    db: AsyncSession, user: User, *, notificacao_id: uuid.UUID | None = None
) -> None:
    agora = datetime.now(timezone.utc)
    filtros = [
        Notificacao.user_id == user.id,
        Notificacao.lida_em.is_(None),
    ]
    if notificacao_id is not None:
        filtros.append(Notificacao.id == notificacao_id)
    await db.execute(update(Notificacao).where(*filtros).values(lida_em=agora))
    await db.commit()
