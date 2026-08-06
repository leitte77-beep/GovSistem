"""Notificações internas (item 42) — listagem, leitura e contadores."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import Paginacao, pagina_payload
from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.enums import SituacaoNotificacao
from app.models.governanca import Notificacao
from app.models.organizacao import User
from app.services import notificacoes

router = APIRouter(prefix="/notificacoes", tags=["Notificações"])


def _visivel_para(user: User):
    return or_(
        Notificacao.destinatario_id == user.id,
        Notificacao.perfil_destino == user.perfil,
    )


@router.get("", summary="Listar notificações")
async def listar(
    situacao: str | None = Query(None),
    apenas_nao_lidas: bool = False,
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    condicoes = [Notificacao.organizacao_id == user.organizacao_id, _visivel_para(user)]
    if situacao:
        condicoes.append(Notificacao.situacao == situacao)
    if apenas_nao_lidas:
        condicoes.append(Notificacao.situacao == SituacaoNotificacao.NAO_LIDA.value)

    total = await db.scalar(select(func.count()).select_from(Notificacao).where(*condicoes)) or 0
    registros = (
        await db.execute(
            select(Notificacao)
            .where(*condicoes)
            .order_by(Notificacao.created_at.desc())
            .offset(paginacao.offset)
            .limit(paginacao.por_pagina)
        )
    ).scalars().all()
    itens = [
        {
            "id": n.id,
            "tipo": n.tipo,
            "titulo": n.titulo,
            "mensagem": n.mensagem,
            "entidade": n.entidade,
            "entidade_id": n.entidade_id,
            "link": n.link,
            "canal": n.canal,
            "situacao": n.situacao,
            "criada_em": n.created_at,
            "lida_em": n.lida_em,
        }
        for n in registros
    ]
    return pagina_payload(itens, total, paginacao)


@router.get("/nao-lidas", summary="Quantidade de notificações não lidas")
async def contar(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return {"total": await notificacoes.nao_lidas(db, user)}


@router.post("/marcar-lidas", summary="Marcar notificações como lidas")
async def marcar_lidas(
    ids: list[uuid.UUID] | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    marcadas = await notificacoes.marcar_lidas(db, user, ids)
    await db.commit()
    return {"marcadas": marcadas}
