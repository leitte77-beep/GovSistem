"""Numeração transacional confiável de atos.

Atribui o próximo número de uma série (organização, tipo de ato, ano) usando
``SELECT ... FOR UPDATE`` na linha da série (row lock) — nunca ``MAX+1`` sem
proteção. O contador é monotônico: nunca diminui, então um número atribuído e
depois cancelado **não** é reutilizado. Reenvios idempotentes (mesma matéria,
mesmo ano) devolvem o mesmo número sem consumir outro.
"""

from __future__ import annotations

import uuid
from datetime import date
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import MatterStatus
from app.models.matter import Matter
from app.models.numbering import ActNumberSeries

_INSTITUTIONAL_TZ = ZoneInfo("America/Sao_Paulo")


def institutional_today() -> date:
    from datetime import datetime

    return datetime.now(_INSTITUTIONAL_TZ).date()


def institutional_year() -> int:
    return institutional_today().year


async def highest_used_number(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    act_type_id: uuid.UUID,
    year: int,
    org_unit_id: uuid.UUID | None = None,
) -> int:
    """Maior número numérico já gravado em matérias (não arquivadas) da série."""
    result = await db.execute(
        select(Matter.act_number).where(
            Matter.organization_id == organization_id,
            Matter.act_type_id == act_type_id,
            Matter.act_year == year,
            Matter.org_unit_id.is_not_distinct_from(org_unit_id),
            Matter.status != MatterStatus.ARCHIVED,
            Matter.act_number.is_not(None),
        )
    )
    highest = 0
    for (raw,) in result.all():
        digits = "".join(ch for ch in str(raw) if ch.isdigit())
        if digits:
            highest = max(highest, int(digits))
    return highest


async def next_in_series(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    act_type_id: uuid.UUID,
    year: int,
    org_unit_id: uuid.UUID | None = None,
) -> int:
    """Consome e devolve o próximo número da série (transacional).

    Uma série nova parte do maior número já usado nas matérias, para não
    reemitir números de atos cadastrados antes de a série existir.
    """
    result = await db.execute(
        select(ActNumberSeries)
        .where(
            ActNumberSeries.organization_id == organization_id,
            ActNumberSeries.act_type_id == act_type_id,
            ActNumberSeries.year == year,
            ActNumberSeries.org_unit_id.is_not_distinct_from(org_unit_id),
        )
        .with_for_update()
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = ActNumberSeries(
            organization_id=organization_id,
            act_type_id=act_type_id,
            org_unit_id=org_unit_id,
            year=year,
            current=await highest_used_number(
                db,
                organization_id=organization_id,
                act_type_id=act_type_id,
                year=year,
                org_unit_id=org_unit_id,
            ),
        )
        db.add(row)
        await db.flush()
    row.current += 1
    await db.flush()
    return row.current


async def issue_number_to_matter(
    db: AsyncSession,
    matter: Matter,
    *,
    year: int | None = None,
) -> tuple[int, int]:
    """Atribui número definitivo à matéria (idempotente).

    Antes disso a matéria NÃO tem número (usa identificador de rascunho). Se a
    matéria já recebeu número no mesmo ano, devolve o existente sem consumir
    outro (reenvio idempotente não gasta número).
    """
    target_year = year or institutional_year()
    if matter.act_year == target_year and matter.act_number:
        return int(matter.act_number), target_year
    number = await next_in_series(
        db,
        organization_id=matter.organization_id,
        act_type_id=matter.act_type_id,
        year=target_year,
        org_unit_id=matter.org_unit_id,
    )
    matter.act_number = str(number)
    matter.act_year = target_year
    matter.act_date = matter.act_date or institutional_today()
    await db.flush()
    return number, target_year


__all__ = [
    "institutional_today",
    "institutional_year",
    "highest_used_number",
    "next_in_series",
    "issue_number_to_matter",
]
