"""Conversa interna da Demanda: comentários, respostas e @menções (§42, §43).

Separação deliberada: o comentário é **comunicação** e pode ser editado por quem
o escreveu; o evento de timeline é **auditoria** e nunca muda. Por isso a edição
aqui não reescreve a história — arquiva o texto anterior em `revisoes`.
"""

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.comentario_demanda import (
    ComentarioDemanda,
    ComentarioMencao,
    ComentarioRevisao,
)
from app.models.enums import TipoEvento, TipoNotificacao
from app.models.tarefa import Tarefa
from app.models.user import User
from app.services.demandas import get_demanda_ou_404, marcar_movimentacao
from app.services.notifications import criar_notificacao
from app.services.timeline import registrar_evento

router = APIRouter(tags=["Comentários"])

# Aceita @nome, @nome.sobrenome e @email@dominio; o casamento com usuário real
# acontece depois, contra a base do tenant.
MENCAO_RE = re.compile(r"@([\w.\-]+(?:@[\w.\-]+)?)")


class ComentarioIn(BaseModel):
    texto: str = Field(min_length=1, max_length=8000)
    tarefa_id: uuid.UUID | None = None
    responde_a_id: uuid.UUID | None = None


class ComentarioEdit(BaseModel):
    texto: str = Field(min_length=1, max_length=8000)


class MencaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    lido_em: datetime | None


class ComentarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    demanda_id: uuid.UUID
    tarefa_id: uuid.UUID | None
    responde_a_id: uuid.UUID | None
    autor_id: uuid.UUID
    autor_nome: str | None = None
    texto: str
    fixado: bool
    editado_em: datetime | None
    created_at: datetime
    mencoes: list[MencaoOut] = []

    @classmethod
    def de(cls, c: ComentarioDemanda) -> "ComentarioOut":
        return cls(
            id=c.id,
            demanda_id=c.demanda_id,
            tarefa_id=c.tarefa_id,
            responde_a_id=c.responde_a_id,
            autor_id=c.autor_id,
            autor_nome=c.autor.name if c.autor else None,
            texto=c.texto,
            fixado=c.fixado,
            editado_em=c.editado_em,
            created_at=c.created_at,
            mencoes=[MencaoOut.model_validate(m) for m in c.mencoes],
        )


async def _resolver_mencoes(
    db: AsyncSession, texto: str, autor: User
) -> list[User]:
    """Casa os @tokens do texto com usuários ativos do mesmo tenant.

    O autor nunca é notificado de si mesmo, e um token que não casa com ninguém
    é silenciosamente ignorado: escrever "@prazo" em uma frase não é menção.
    """
    tokens = {t.lower() for t in MENCAO_RE.findall(texto or "")}
    if not tokens:
        return []
    encontrados: dict[uuid.UUID, User] = {}
    for token in tokens:
        resultado = await db.execute(
            select(User)
            .where(
                User.organization_id == autor.organization_id,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
                User.id != autor.id,
                (User.email.ilike(token))
                | (User.email.ilike(f"{token}@%"))
                | (func.replace(func.lower(User.name), " ", ".").like(f"%{token}%")),
            )
            .limit(5)
        )
        for u in resultado.scalars().all():
            encontrados[u.id] = u
    return list(encontrados.values())


async def _get_comentario(
    db: AsyncSession, demanda_id: uuid.UUID, comentario_id: uuid.UUID, user: User
) -> tuple[ComentarioDemanda, object]:
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    comentario = (
        await db.execute(
            select(ComentarioDemanda)
            .where(
                ComentarioDemanda.id == comentario_id,
                ComentarioDemanda.demanda_id == demanda.id,
                ComentarioDemanda.deleted_at.is_(None),
            )
            .options(
                selectinload(ComentarioDemanda.autor),
                selectinload(ComentarioDemanda.mencoes),
            )
        )
    ).scalar_one_or_none()
    if comentario is None:
        raise HTTPException(404, "Comentário não encontrado")
    return comentario, demanda


@router.get("/demandas/{demanda_id}/comentarios", response_model=list[ComentarioOut])
async def listar(
    demanda_id: uuid.UUID,
    tarefa_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    stmt = (
        select(ComentarioDemanda)
        .where(
            ComentarioDemanda.demanda_id == demanda.id,
            ComentarioDemanda.deleted_at.is_(None),
        )
        .options(
            selectinload(ComentarioDemanda.autor),
            selectinload(ComentarioDemanda.mencoes),
        )
        # Fixados primeiro (§42), depois ordem cronológica da conversa.
        .order_by(ComentarioDemanda.fixado.desc(), ComentarioDemanda.created_at)
    )
    if tarefa_id is not None:
        stmt = stmt.where(ComentarioDemanda.tarefa_id == tarefa_id)
    return [
        ComentarioOut.de(c) for c in (await db.execute(stmt)).scalars().all()
    ]


@router.post(
    "/demandas/{demanda_id}/comentarios",
    response_model=ComentarioOut,
    status_code=201,
)
async def comentar(
    demanda_id: uuid.UUID,
    payload: ComentarioIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Comentar exige apenas leitura: participar da conversa não é editar a demanda."""
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))

    if payload.tarefa_id is not None:
        pertence = (
            await db.execute(
                select(Tarefa.id).where(
                    Tarefa.id == payload.tarefa_id,
                    Tarefa.demanda_id == demanda.id,
                    Tarefa.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if pertence is None:
            raise HTTPException(404, "Tarefa não encontrada nesta demanda")

    if payload.responde_a_id is not None:
        pai = (
            await db.execute(
                select(ComentarioDemanda).where(
                    ComentarioDemanda.id == payload.responde_a_id,
                    ComentarioDemanda.demanda_id == demanda.id,
                    ComentarioDemanda.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if pai is None:
            raise HTTPException(404, "Comentário respondido não encontrado")

    comentario = ComentarioDemanda(
        organization_id=user.organization_id,
        demanda_id=demanda.id,
        tarefa_id=payload.tarefa_id,
        responde_a_id=payload.responde_a_id,
        autor_id=user.id,
        texto=payload.texto,
    )
    db.add(comentario)
    await db.flush()

    mencionados = await _resolver_mencoes(db, payload.texto, user)
    for destinatario in mencionados:
        db.add(
            ComentarioMencao(comentario_id=comentario.id, user_id=destinatario.id)
        )
        await criar_notificacao(
            db,
            destinatario_id=destinatario.id,
            tipo=TipoNotificacao.COMENTARIO_MENCAO,
            demanda_id=demanda.id,
            tarefa_id=payload.tarefa_id,
            mensagem=(
                f"{user.name} mencionou você em um comentário da demanda "
                f"{demanda.numero}"
            ),
        )

    await marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        TipoEvento.COMENTARIO_ADICIONADO,
        user.id,
        f"{user.name} comentou na demanda",
        demanda_id=demanda.id,
        tarefa_id=payload.tarefa_id,
        metadados={
            "comentario_id": str(comentario.id),
            "mencionados": [str(u.id) for u in mencionados],
        },
    )
    await db.commit()
    comentario = (
        await db.execute(
            select(ComentarioDemanda)
            .where(ComentarioDemanda.id == comentario.id)
            .options(
                selectinload(ComentarioDemanda.autor),
                selectinload(ComentarioDemanda.mencoes),
            )
        )
    ).scalar_one()
    return ComentarioOut.de(comentario)


@router.patch(
    "/demandas/{demanda_id}/comentarios/{comentario_id}", response_model=ComentarioOut
)
async def editar(
    demanda_id: uuid.UUID,
    comentario_id: uuid.UUID,
    payload: ComentarioEdit,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Edita o próprio comentário, guardando o texto anterior."""
    comentario, demanda = await _get_comentario(db, demanda_id, comentario_id, user)
    permissoes = get_user_permissions(user)
    if comentario.autor_id != user.id and Perm.ADMIN_CONFIG not in permissoes:
        raise HTTPException(403, "Só o autor pode editar o comentário")
    if payload.texto == comentario.texto:
        return ComentarioOut.de(comentario)

    db.add(
        ComentarioRevisao(
            comentario_id=comentario.id,
            texto_anterior=comentario.texto,
            editado_por_id=user.id,
        )
    )
    comentario.texto = payload.texto
    comentario.editado_em = datetime.now(timezone.utc)

    # Menções novas geram aviso; as que já existiam não são reenviadas.
    ja_mencionados = {m.user_id for m in comentario.mencoes}
    for destinatario in await _resolver_mencoes(db, payload.texto, user):
        if destinatario.id in ja_mencionados:
            continue
        db.add(ComentarioMencao(comentario_id=comentario.id, user_id=destinatario.id))
        await criar_notificacao(
            db,
            destinatario_id=destinatario.id,
            tipo=TipoNotificacao.COMENTARIO_MENCAO,
            demanda_id=demanda.id,
            tarefa_id=comentario.tarefa_id,
            mensagem=(
                f"{user.name} mencionou você em um comentário da demanda "
                f"{demanda.numero}"
            ),
        )
    await db.commit()
    comentario, _ = await _get_comentario(db, demanda_id, comentario_id, user)
    return ComentarioOut.de(comentario)


@router.get("/demandas/{demanda_id}/comentarios/{comentario_id}/revisoes")
async def revisoes(
    demanda_id: uuid.UUID,
    comentario_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Histórico de edição do comentário (§42)."""
    comentario, _ = await _get_comentario(db, demanda_id, comentario_id, user)
    return (
        (
            await db.execute(
                select(ComentarioRevisao)
                .where(ComentarioRevisao.comentario_id == comentario.id)
                .order_by(ComentarioRevisao.created_at)
            )
        )
        .scalars()
        .all()
    )


@router.post(
    "/demandas/{demanda_id}/comentarios/{comentario_id}/fixar",
    response_model=ComentarioOut,
)
async def fixar(
    demanda_id: uuid.UUID,
    comentario_id: uuid.UUID,
    fixado: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    comentario, _ = await _get_comentario(db, demanda_id, comentario_id, user)
    comentario.fixado = fixado
    await db.commit()
    comentario, _ = await _get_comentario(db, demanda_id, comentario_id, user)
    return ComentarioOut.de(comentario)


@router.delete("/demandas/{demanda_id}/comentarios/{comentario_id}", status_code=204)
async def excluir(
    demanda_id: uuid.UUID,
    comentario_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Exclusão lógica: o comentário sai da conversa, o registro permanece."""
    comentario, _ = await _get_comentario(db, demanda_id, comentario_id, user)
    permissoes = get_user_permissions(user)
    if comentario.autor_id != user.id and Perm.ADMIN_CONFIG not in permissoes:
        raise HTTPException(403, "Só o autor pode excluir o comentário")
    comentario.deleted_at = datetime.now(timezone.utc)
    await db.commit()


@router.get("/minhas-mencoes")
async def minhas_mencoes(
    apenas_nao_lidas: bool = True,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Onde fui citado (§42). Respeita o escopo de visibilidade das demandas."""
    from app.models.demanda import Demanda
    from app.services.demandas import aplicar_escopo

    visiveis = aplicar_escopo(
        select(Demanda.id), user, get_user_permissions(user)
    ).scalar_subquery()
    stmt = (
        select(ComentarioMencao, ComentarioDemanda)
        .join(ComentarioDemanda, ComentarioMencao.comentario_id == ComentarioDemanda.id)
        .where(
            ComentarioMencao.user_id == user.id,
            ComentarioDemanda.deleted_at.is_(None),
            ComentarioDemanda.demanda_id.in_(visiveis),
        )
        .order_by(ComentarioDemanda.created_at.desc())
        .limit(100)
    )
    if apenas_nao_lidas:
        stmt = stmt.where(ComentarioMencao.lido_em.is_(None))
    return [
        {
            "mencao_id": str(m.id),
            "comentario_id": str(c.id),
            "demanda_id": str(c.demanda_id),
            "tarefa_id": str(c.tarefa_id) if c.tarefa_id else None,
            "texto": c.texto,
            "criado_em": c.created_at,
            "lido_em": m.lido_em,
        }
        for m, c in (await db.execute(stmt)).all()
    ]


@router.post("/minhas-mencoes/{mencao_id}/lida", status_code=204)
async def marcar_mencao_lida(
    mencao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    mencao = (
        await db.execute(
            select(ComentarioMencao).where(
                ComentarioMencao.id == mencao_id, ComentarioMencao.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if mencao is None:
        raise HTTPException(404, "Menção não encontrada")
    mencao.lido_em = datetime.now(timezone.utc)
    await db.commit()
