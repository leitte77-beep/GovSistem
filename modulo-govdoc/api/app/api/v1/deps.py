"""Dependências e utilitários compartilhados pelas rotas."""

import uuid
from typing import Dict, Iterable, Optional

from fastapi import Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_current_user
from app.core.database import get_db
from app.core.errors import NotFound
from app.models.organization import Department, Institution, Secretariat
from app.models.user import User


async def get_institution(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> Institution:
    institution = await db.get(Institution, user.institution_id)
    if institution is None:
        raise NotFound("Instituição não encontrada.")
    return institution


def client_info(request: Request) -> dict:
    return get_client_info(request)


class Pagination:
    def __init__(
        self,
        pagina: int = Query(1, ge=1),
        por_pagina: int = Query(25, ge=1, le=200),
    ):
        self.pagina = pagina
        self.por_pagina = por_pagina
        self.offset = (pagina - 1) * por_pagina


async def user_names(db: AsyncSession, ids: Iterable[Optional[uuid.UUID]]) -> Dict[uuid.UUID, str]:
    clean = {i for i in ids if i}
    if not clean:
        return {}
    rows = (await db.execute(select(User.id, User.name).where(User.id.in_(clean)))).all()
    return {row[0]: row[1] for row in rows}


async def secretariat_names(
    db: AsyncSession, ids: Iterable[Optional[uuid.UUID]]
) -> Dict[uuid.UUID, str]:
    clean = {i for i in ids if i}
    if not clean:
        return {}
    rows = (
        await db.execute(
            select(Secretariat.id, Secretariat.name).where(Secretariat.id.in_(clean))
        )
    ).all()
    return {row[0]: row[1] for row in rows}


async def department_names(
    db: AsyncSession, ids: Iterable[Optional[uuid.UUID]]
) -> Dict[uuid.UUID, str]:
    clean = {i for i in ids if i}
    if not clean:
        return {}
    rows = (
        await db.execute(
            select(Department.id, Department.name).where(Department.id.in_(clean))
        )
    ).all()
    return {row[0]: row[1] for row in rows}


def page_payload(itens: list, total: int, pagination: Pagination) -> dict:
    return {
        "itens": itens,
        "total": total,
        "pagina": pagination.pagina,
        "por_pagina": pagination.por_pagina,
        "paginas": (total + pagination.por_pagina - 1) // pagination.por_pagina,
    }
