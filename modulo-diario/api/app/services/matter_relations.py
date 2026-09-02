"""Matter relations service (Fase 2).

Provides guarded, tenant-isolated, audited create/list/delete of structured
relationships between published matters, plus a derived "legal situation"
view used by the public pages.

The relations table is a LIVING layer on top of immutable snapshots: a relation
may be created after the source matter was published (e.g. June decree revoking
a January portaria). We never rewrite the snapshot/document.
"""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.audit_event import AuditEvent
from app.models.enums import AuditAction, MatterRelationType
from app.models.matter import Matter
from app.models.matter_relation import MatterRelation

# relation types that "invalidate" the target and therefore must not be
# mirrored back (A revokes B cannot coexist with B revokes A).
_DIRECTIONAL = {
    MatterRelationType.CANCELS,
    MatterRelationType.REVOKES,
    MatterRelationType.SUPERSEDES,
    MatterRelationType.RECTIFIES,
    MatterRelationType.REPUBLISHES,
    MatterRelationType.AMENDS,
}


class RelationError(ValueError):
    pass


async def _load_matter(db: AsyncSession, matter_id: uuid.UUID) -> Optional[Matter]:
    result = await db.execute(select(Matter).where(Matter.id == matter_id))
    return result.scalar_one_or_none()


async def create_relation(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    source_matter_id: uuid.UUID,
    target_matter_id: uuid.UUID,
    relation_type: MatterRelationType | str,
    actor_id: uuid.UUID,
    notes: Optional[str] = None,
) -> MatterRelation:
    """Create a validated relation. All failures are RelationError (422)."""
    rt = (
        relation_type
        if isinstance(relation_type, MatterRelationType)
        else MatterRelationType(str(relation_type).lower())
    )
    if source_matter_id == target_matter_id:
        raise RelationError("Uma publicação não pode ser relacionada a si mesma.")

    source = await _load_matter(db, source_matter_id)
    target = await _load_matter(db, target_matter_id)
    if source is None or target is None:
        raise RelationError("Publicação de origem ou destino não encontrada.")
    if str(source.organization_id) != str(organization_id) or str(
        target.organization_id
    ) != str(organization_id):
        raise RelationError("As publicações devem pertencer à mesma organização.")

    # exact duplicate
    dup = await db.execute(
        select(MatterRelation).where(
            MatterRelation.organization_id == organization_id,
            MatterRelation.source_matter_id == source_matter_id,
            MatterRelation.target_matter_id == target_matter_id,
            MatterRelation.relation_type == rt.value,
        )
    )
    if dup.scalar_one_or_none() is not None:
        raise RelationError("Essa relação já está registrada entre essas publicações.")

    # reject reverse/loop (A→B and B→A are semantically impossible for these types)
    if rt in _DIRECTIONAL:
        rev = await db.execute(
            select(MatterRelation).where(
                MatterRelation.organization_id == organization_id,
                MatterRelation.source_matter_id == target_matter_id,
                MatterRelation.target_matter_id == source_matter_id,
            )
        )
        if rev.scalar_one_or_none() is not None:
            raise RelationError("Relação inversa já existente entre essas publicações.")

    rel = MatterRelation(
        organization_id=organization_id,
        source_matter_id=source_matter_id,
        target_matter_id=target_matter_id,
        relation_type=rt.value,
        notes=notes,
        created_by=actor_id,
    )
    db.add(rel)
    db.add(
        AuditEvent(
            organization_id=organization_id,
            user_id=actor_id,
            action=AuditAction.MATTER_RELATION_CREATED,
            entity_type="matter_relation",
            entity_id=rel.id if rel.id else None,
            description=(
                f"{rt.value}: {source_matter_id} -> {target_matter_id}"
            ),
            extra_metadata={
                "source_matter_id": str(source_matter_id),
                "target_matter_id": str(target_matter_id),
                "relation_type": rt.value,
            },
        )
    )
    await db.commit()
    await db.refresh(rel)
    return rel


async def delete_relation(
    db: AsyncSession,
    *,
    relation_id: uuid.UUID,
    organization_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> None:
    result = await db.execute(
        select(MatterRelation).where(
            MatterRelation.id == relation_id,
            MatterRelation.organization_id == organization_id,
        )
    )
    rel = result.scalar_one_or_none()
    if rel is None:
        raise RelationError("Relação não encontrada.")
    db.add(
        AuditEvent(
            organization_id=organization_id,
            user_id=actor_id,
            action=AuditAction.MATTER_RELATION_DELETED,
            entity_type="matter_relation",
            entity_id=relation_id,
            description=(
                f"removed {rel.relation_type} "
                f"{rel.source_matter_id}->{rel.target_matter_id}"
            ),
            extra_metadata={
                "source_matter_id": str(rel.source_matter_id),
                "target_matter_id": str(rel.target_matter_id),
                "relation_type": rel.relation_type,
            },
        )
    )
    await db.delete(rel)
    await db.commit()


async def list_relations_for_matter(
    db: AsyncSession, organization_id: uuid.UUID, matter_id: uuid.UUID
) -> dict[str, list[MatterRelation]]:
    """Return {outgoing, incoming} relations for a matter (tenant-scoped)."""
    rows = await db.execute(
        select(MatterRelation)
        .where(
            MatterRelation.organization_id == organization_id,
            or_(
                MatterRelation.source_matter_id == matter_id,
                MatterRelation.target_matter_id == matter_id,
            ),
        )
        .options(selectinload(MatterRelation.source), selectinload(MatterRelation.target))
    )
    relations = list(rows.scalars().all())
    outgoing = [r for r in relations if str(r.source_matter_id) == str(matter_id)]
    incoming = [r for r in relations if str(r.target_matter_id) == str(matter_id)]
    return {"outgoing": outgoing, "incoming": incoming}


def legal_status_flags(
    incoming: list[MatterRelation],
) -> dict[str, Optional[MatterRelation]]:
    """Summarize the target-side legal situation from the matter's incoming relations.

    Used to answer: "Was this publication rectified / revoked / cancelled / ...?"
    """
    latest: dict[str, MatterRelation] = {}
    for rel in incoming:
        rt = MatterRelationType(rel.relation_type)
        prev = latest.get(rt.value)
        if prev is None or rel.created_at >= prev.created_at:
            latest[rt.value] = rel
    return latest


async def list_relations(
    db: AsyncSession, organization_id: uuid.UUID
) -> list[MatterRelation]:
    result = await db.execute(
        select(MatterRelation)
        .where(MatterRelation.organization_id == organization_id)
        .order_by(MatterRelation.created_at.desc())
    )
    return list(result.scalars().all())


async def list_relations_batch(
    db: AsyncSession,
    organization_id: uuid.UUID,
    matter_ids: list[uuid.UUID],
) -> dict[str, dict[str, list[MatterRelation]]]:
    """Relations for a batch of matter ids (avoids N+1 on edition reads)."""
    if not matter_ids:
        return {}
    ids = list(set(matter_ids))
    result = await db.execute(
        select(MatterRelation)
        .where(
            MatterRelation.organization_id == organization_id,
            or_(
                MatterRelation.source_matter_id.in_(ids),
                MatterRelation.target_matter_id.in_(ids),
            ),
        )
        .options(selectinload(MatterRelation.source), selectinload(MatterRelation.target))
    )
    grouped: dict[str, dict[str, list[MatterRelation]]] = {}
    for mid in ids:
        grouped[str(mid)] = {"outgoing": [], "incoming": []}
    for rel in result.scalars().all():
        s = str(rel.source_matter_id)
        t = str(rel.target_matter_id)
        if s in grouped:
            grouped[s]["outgoing"].append(rel)
        if t in grouped:
            grouped[t]["incoming"].append(rel)
    return grouped


def relation_public(rel: MatterRelation) -> dict:
    """Minimal public representation (no internal users/storage)."""
    src_title = getattr(getattr(rel, "source", None), "title", None)
    tgt_title = getattr(getattr(rel, "target", None), "title", None)
    return {
        "id": str(rel.id),
        "source_matter_id": str(rel.source_matter_id),
        "target_matter_id": str(rel.target_matter_id),
        "source_title": src_title,
        "target_title": tgt_title,
        "relation_type": MatterRelationType(rel.relation_type).value,
        "label": MatterRelationType(rel.relation_type).label,
        "notes": rel.notes,
        "created_at": rel.created_at.isoformat() if rel.created_at else None,
    }
