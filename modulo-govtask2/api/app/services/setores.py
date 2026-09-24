"""Setores da prefeitura: semear o padrão, cadastrar os próprios, guardar uso.

O padrão vem de `core.fluxo.SETORES_PADRAO`. Como os encaminhamentos guardam
o código do setor (não o id), o código é estável e o nome é o que se edita.
"""

import re
import unicodedata
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import fluxo
from app.models.auth_models import User
from app.models.config import Setor
from app.models.pedido import Pedido, SituacaoPedido


def _slug(nome: str) -> str:
    base = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    base = re.sub(r"[^A-Za-z0-9]+", "_", base).strip("_").upper()
    return base[:40] or "SETOR"


async def garantir_setores(db: AsyncSession, organization_id: uuid.UUID) -> None:
    """Cria os setores padrão que faltarem. Idempotente."""
    existentes = set(
        await db.scalars(
            select(Setor.codigo).where(Setor.organization_id == organization_id)
        )
    )
    for codigo, nome, sistema in fluxo.SETORES_PADRAO:
        if codigo not in existentes:
            db.add(
                Setor(
                    organization_id=organization_id,
                    codigo=codigo,
                    nome=nome,
                    sistema=sistema,
                )
            )
    await db.flush()


async def listar(
    db: AsyncSession, organization_id: uuid.UUID, incluir_inativos: bool = False
) -> list[Setor]:
    query = select(Setor).where(Setor.organization_id == organization_id)
    if not incluir_inativos:
        query = query.where(Setor.ativo.is_(True))
    result = await db.execute(query.order_by(Setor.sistema.desc(), Setor.nome))
    return list(result.scalars().all())


async def exigir_ativo(
    db: AsyncSession, organization_id: uuid.UUID, codigo: str
) -> Setor:
    """Devolve o setor ativo com este código, ou 422."""
    setor = await db.scalar(
        select(Setor).where(
            Setor.organization_id == organization_id,
            Setor.codigo == codigo,
        )
    )
    if setor is None or not setor.ativo:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Setor “{codigo}” não existe ou está inativo nesta prefeitura.",
        )
    return setor


async def _codigo_livre(
    db: AsyncSession, organization_id: uuid.UUID, nome: str
) -> str:
    base = _slug(nome)
    codigo = base
    sufixo = 1
    while await db.scalar(
        select(Setor.id).where(
            Setor.organization_id == organization_id, Setor.codigo == codigo
        )
    ):
        sufixo += 1
        codigo = f"{base[:36]}_{sufixo}"
    return codigo


async def criar(
    db: AsyncSession, organization_id: uuid.UUID, nome: str
) -> Setor:
    nome = " ".join(nome.split())
    if len(nome) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Informe o nome do setor.",
        )
    setor = Setor(
        organization_id=organization_id,
        codigo=await _codigo_livre(db, organization_id, nome),
        nome=nome,
    )
    db.add(setor)
    await db.commit()
    return setor


async def editar(
    db: AsyncSession,
    organization_id: uuid.UUID,
    setor_id: uuid.UUID,
    *,
    nome: str | None = None,
    ativo: bool | None = None,
    prazo_dias=...,
    responsavel_id=...,
) -> Setor:
    setor = await db.scalar(
        select(Setor).where(
            Setor.id == setor_id, Setor.organization_id == organization_id
        )
    )
    if setor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Setor não encontrado."
        )
    if nome is not None:
        nome = " ".join(nome.split())
        if len(nome) < 2:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Nome de setor muito curto.",
            )
        setor.nome = nome
    if ativo is not None:
        if setor.sistema and not ativo:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="O setor de espera externa precisa ficar ativo.",
            )
        setor.ativo = ativo
    # `...` = não veio no pedido; None = limpar.
    if prazo_dias is not ...:
        setor.prazo_dias = prazo_dias
    if responsavel_id is not ...:
        setor.responsavel_id = responsavel_id
    await db.commit()
    return setor


async def remover(
    db: AsyncSession, organization_id: uuid.UUID, setor_id: uuid.UUID
) -> None:
    setor = await db.scalar(
        select(Setor).where(
            Setor.id == setor_id, Setor.organization_id == organization_id
        )
    )
    if setor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Setor não encontrado."
        )
    if setor.sistema:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este setor é do sistema e não pode ser excluído.",
        )

    em_uso_por_pessoa = await db.scalar(
        select(func.count(User.id)).where(
            User.organization_id == organization_id,
            User.setor == setor.codigo,
            User.deleted_at.is_(None),
        )
    )
    aberto = await db.scalar(
        select(func.count(Pedido.id)).where(
            Pedido.organization_id == organization_id,
            Pedido.setor_atual == setor.codigo,
            Pedido.situacao == SituacaoPedido.EM_SETOR.value,
        )
    )
    if (em_uso_por_pessoa or 0) > 0 or (aberto or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Setor em uso. Desative-o em vez de excluir, para não perder o "
                "histórico de quem passou por ele."
            ),
        )

    await db.delete(setor)
    await db.commit()
