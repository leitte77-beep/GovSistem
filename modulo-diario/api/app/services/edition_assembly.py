"""Assembly helpers for the edition publication queue.

The publication queue is the set of APPROVED matters that are not yet assigned
to any live edition. Assembly = classify each matter into its editorial section
and order them deterministically (section -> órgão -> tipo -> número), so the
operator creates an edition and it is already organized.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.models.edition import Edition
from app.models.edition_item import EditionItem
from app.models.enums import EditionStatus, MatterStatus, MatterWorkflowStatus
from app.models.matter import Matter
from app.services.edition_classification import (
    matter_sort_key,
    section_for_matter,
    section_rank,
)


def _live_edition_matter_ids():
    """Subquery: matter ids already used by a non-cancelled edition."""
    return (
        select(EditionItem.matter_id)
        .join(Edition, Edition.id == EditionItem.edition_id)
        .where(Edition.status != EditionStatus.CANCELLED)
    )


async def approved_matters_for_queue(
    db,
    organization_id: uuid.UUID,
    *,
    target_date: Optional[date] = None,
) -> list[Matter]:
    """APPROVED matters not yet assigned to any live edition (the queue)."""
    query = (
        select(Matter)
        .where(
            Matter.organization_id == organization_id,
            Matter.status == MatterStatus.APPROVED,
            ~Matter.id.in_(_live_edition_matter_ids()),
        )
        .options(
            selectinload(Matter.act_type),
            selectinload(Matter.org_unit),
        )
    )
    if target_date is not None:
        query = query.where(Matter.act_date == target_date)
    result = await db.execute(query)
    return list(result.scalars().all())


async def auto_fill_edition(
    db,
    edition: Edition,
    *,
    target_date: Optional[date] = None,
) -> int:
    """Add every queued matter to ``edition``, classified and ordered.

    Returns the number of items added. Existing items are never duplicated.
    """
    matters = await approved_matters_for_queue(
        db, edition.organization_id, target_date=target_date
    )
    matters.sort(key=lambda m: matter_sort_key(m, m.act_type, m.org_unit))

    existing_ids = {item.matter_id for item in (edition.items or [])}
    max_pos = await db.scalar(
        select(func.coalesce(func.max(EditionItem.position), -1)).where(
            EditionItem.edition_id == edition.id
        )
    )
    position = int(max_pos if max_pos is not None else -1) + 1

    added = 0
    for matter in matters:
        if matter.id in existing_ids:
            continue
        db.add(
            EditionItem(
                edition_id=edition.id,
                matter_id=matter.id,
                section_title=section_for_matter(matter, matter.act_type),
                position=position,
            )
        )
        if getattr(matter, "workflow_status", None) != MatterWorkflowStatus.PUBLICADO.value:
            matter.workflow_status = MatterWorkflowStatus.INSERIDA_EM_EDICAO.value
        position += 1
        added += 1

    await db.flush()
    return added


async def auto_order_edition(db, edition: Edition) -> None:
    """Recompute item positions by editorial section/type/number order."""
    items = list(edition.items or [])

    def key(item: EditionItem) -> tuple:
        matter = item.matter
        section = item.section_title or section_for_matter(matter, matter.act_type)
        return (section_rank(section),) + matter_sort_key(
            matter, matter.act_type, matter.org_unit
        )

    ordered = sorted(items, key=key)
    # Fill missing sections so the grouping is explicit and stable.
    for item in ordered:
        if not item.section_title and item.matter is not None:
            item.section_title = section_for_matter(item.matter, item.matter.act_type)
    for position, item in enumerate(ordered):
        item.position = position
    await db.flush()
