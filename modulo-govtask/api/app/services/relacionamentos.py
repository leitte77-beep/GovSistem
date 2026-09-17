"""Regras de relacionamento entre demandas (§220–§222).

Hierarquia pai/filha forma uma árvore. O vínculo é validado contra ciclos:
sem isso, duas demandas poderiam ser pai uma da outra e o cálculo de progresso
agregado entraria em recursão infinita.
"""

import uuid
from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.demanda import Demanda
from app.models.relacionamento_demanda import DemandaRelacionamento


async def _demanda_do_tenant(
    db: AsyncSession, demanda_id: uuid.UUID, organization_id: uuid.UUID
) -> Demanda | None:
    return (
        await db.execute(
            select(Demanda).where(
                Demanda.id == demanda_id,
                Demanda.organization_id == organization_id,
                Demanda.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()


async def validar_vinculo_pai(
    db: AsyncSession,
    *,
    demanda: Demanda,
    pai_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> Demanda:
    """Valida e devolve a demanda pai, recusando self e ciclos."""
    if pai_id == demanda.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uma demanda não pode ser pai de si mesma",
        )
    pai = await _demanda_do_tenant(db, pai_id, organization_id)
    if pai is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Demanda pai não encontrada"
        )

    # Sobe a cadeia a partir do pai: se a própria demanda aparecer, o vínculo
    # fecharia um ciclo.
    atual: Demanda | None = pai
    visitados: set[uuid.UUID] = set()
    while atual is not None:
        if atual.id == demanda.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="O vínculo criaria um ciclo entre demandas",
            )
        if atual.id in visitados:
            break
        visitados.add(atual.id)
        if atual.demanda_pai_id is None:
            break
        atual = await _demanda_do_tenant(db, atual.demanda_pai_id, organization_id)
    return pai


async def progresso_agregado(db: AsyncSession, demanda: Demanda) -> dict:
    """Resumo das filhas e progresso médio ponderado (§222).

    Demanda sem filhas não inventa progresso: devolve `tem_filhas=False`, e a
    interface mostra o progresso próprio.
    """
    filhas = (
        (
            await db.execute(
                select(Demanda).where(
                    Demanda.demanda_pai_id == demanda.id,
                    Demanda.organization_id == demanda.organization_id,
                    Demanda.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    if not filhas:
        return {
            "tem_filhas": False,
            "total_filhas": 0,
            "filhas_concluidas": 0,
            "progresso_filhas": None,
            "progresso_agregado": demanda.progresso,
        }
    concluidas = sum(1 for f in filhas if f.encerrada)
    media = round(sum(int(f.progresso or 0) for f in filhas) / len(filhas))
    return {
        "tem_filhas": True,
        "total_filhas": len(filhas),
        "filhas_concluidas": concluidas,
        "progresso_filhas": media,
        "progresso_agregado": media,
    }


async def ids_filhas(db: AsyncSession, demanda_id: uuid.UUID, organization_id: uuid.UUID) -> Iterable[uuid.UUID]:
    linhas = (
        await db.execute(
            select(Demanda.id).where(
                Demanda.demanda_pai_id == demanda_id,
                Demanda.organization_id == organization_id,
                Demanda.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    return linhas


async def contar_vinculos(db: AsyncSession, demanda_id: uuid.UUID) -> int:
    return (
        await db.execute(
            select(func.count())
            .select_from(DemandaRelacionamento)
            .where(
                DemandaRelacionamento.demanda_id == demanda_id,
                DemandaRelacionamento.deleted_at.is_(None),
            )
        )
    ).scalar_one()
