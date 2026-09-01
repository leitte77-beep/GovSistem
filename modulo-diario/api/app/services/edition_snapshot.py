"""Edition snapshot creation service (Fase 11)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.edition import Edition
from app.models.edition_item import EditionItem
from app.models.edition_publication_snapshot import EditionPublicationSnapshot
from app.models.matter import Matter
from app.semantic.snapshot import build_publication_snapshot


async def create_edition_snapshot(
    db: AsyncSession,
    edition_meta: dict,
    user_id: uuid.UUID | None,
) -> EditionPublicationSnapshot:
    """Freeze the edition into an immutable snapshot.

    Must be called with the edition in a closed (pre-sign) state. After this
    the snapshot must never change. We pass ``edition_meta`` as plain values
    (no lazy ORM attribute access) and query matters/attachments explicitly to
    avoid greenlet errors in the async context.
    """
    edition_id = edition_meta["id"]
    result = await db.execute(
        select(EditionItem)
        .where(EditionItem.edition_id == edition_id)
        .order_by(EditionItem.position)
    )
    items = list(result.scalars().all())
    items.sort(key=lambda i: i.position)

    matter_ids = [item.matter_id for item in items if item.matter_id]
    matters_by_id: dict = {}
    if matter_ids:
        mresult = await db.execute(
            select(Matter)
            .where(Matter.id.in_(matter_ids))
        )
        for m in mresult.scalars().all():
            matters_by_id[m.id] = m

    # Attachments as plain dicts (no ORM relationship lazy loads in async).
    attachments_by_matter: dict[str, list[dict]] = {}
    if matter_ids:
        from app.models.file import File
        from app.models.matter_attachment import MatterAttachment

        aresult = await db.execute(
            select(MatterAttachment, File)
            .join(File, File.id == MatterAttachment.file_id)
            .where(MatterAttachment.matter_id.in_(matter_ids))
            .order_by(MatterAttachment.position)
        )
        for att, file_obj in aresult.all():
            attachments_by_matter.setdefault(str(att.matter_id), []).append({
                "id": str(att.id),
                "title": att.title,
                "type": getattr(att.type, "value", att.type),
                "position": att.position,
                "filename": file_obj.filename,
                "storage_path": file_obj.storage_path,
                "hash": file_obj.hash,
            })

    matters = [
        (matters_by_id[item.matter_id], item.position, item.section_title)
        for item in items
        if item.matter_id in matters_by_id
    ]

    template_snapshots = _collect_templates_from_matters(matters)

    snapshot_dict = build_publication_snapshot(
        _EditionMeta(edition_meta),
        matters,
        template_snapshots=template_snapshots,
        attachments_by_matter=attachments_by_matter,
        renderer_version="semantic-renderer/1.0",
    )

    record = EditionPublicationSnapshot(
        edition_id=edition_id,
        organization_id=edition_meta["organization_id"],
        content=snapshot_dict,
        content_manifest_hash=snapshot_dict["content_manifest_hash"],
        frozen_at=datetime.now(timezone.utc),
        frozen_by=user_id,
        is_valid=True,
    )
    db.add(record)
    await db.flush()
    return record


class _EditionMeta:
    """Thin attribute holder so build_publication_snapshot stays unchanged."""

    def __init__(self, meta: dict):
        self.id = meta["id"]
        self.organization_id = meta["organization_id"]
        self.year = meta["year"]
        self.number = meta["number"]
        self.type = meta["type"]
        self.title = meta["title"]
        self.subtitle = meta.get("subtitle")
        self.publication_date = meta.get("publication_date")
        self.verification_code = meta.get("verification_code")


def _collect_templates_from_matters(matters) -> list[dict]:
    """Collect unique template/version references from the (matter,pos,sec) tuples."""
    seen: set = set()
    templates: list[dict] = []
    for matter, _pos, _sec in matters:
        if matter is None:
            continue
        key = (str(matter.template_id), matter.template_version)
        if key in seen:
            continue
        seen.add(key)
        templates.append({
            "template_id": str(matter.template_id) if matter.template_id else None,
            "template_version": matter.template_version,
            "matter_id": str(matter.id),
        })
    return templates
