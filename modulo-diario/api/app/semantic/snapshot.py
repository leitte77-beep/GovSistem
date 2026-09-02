"""Immutable edition publication snapshot builder (Fase 11).

On edition close/publication we freeze every matter's semantic document, its
template + version, assets and ordering into a snapshot. After freezing,
mutations to the underlying matters/templates MUST NOT affect the edition.
``content_manifest_hash`` covers the canonical manifest so later tampering is
detectable.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone
from typing import Any, Optional

from .schemas import SemanticDocument


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def matter_snapshot(
    matter,
    *,
    position: int,
    section_title: Optional[str],
    attachments_override: Optional[list[dict]] = None,
) -> dict[str, Any]:
    """Build a frozen representation of a single matter for the snapshot.

    ``attachments_override`` (plain dicts) avoids lazy ORM loads in async
    contexts; when omitted, the matter's ``attachments`` relationship is used.
    """
    semantic = None
    raw = getattr(matter, "semantic_content", None) or getattr(matter, "content_json", None)
    if raw:
        try:
            semantic = SemanticDocument.model_validate(raw)
        except Exception:
            semantic = None

    if attachments_override is not None:
        attachments = attachments_override
    else:
        attachments = []
        for att in (matter.attachments or []):
            file_obj = getattr(att, "file", None)
            attachments.append({
                "id": str(att.id),
                "title": att.title,
                "type": att.type,
                "position": att.position,
                "filename": file_obj.filename if file_obj else None,
                "storage_path": file_obj.storage_path if file_obj else None,
                "hash": file_obj.hash if file_obj else None,
            })

    semantic_hash = None
    if semantic:
        canonical = semantic.model_dump(mode="json")
        semantic_hash = hashlib.sha256(
            json.dumps(canonical, sort_keys=True, ensure_ascii=False, default=str)
            .encode("utf-8")
        ).hexdigest()

    responsible = {
        "id": str(matter.responsible_id) if getattr(matter, "responsible_id", None) else None,
        "name": getattr(matter, "responsible_name", None),
        "role": getattr(matter, "responsible_role", None),
    }
    metadata = getattr(matter, "metadata_json", None)

    return {
        "id": str(matter.id),
        "position": position,
        "section_title": section_title,
        "title": matter.title,
        "summary": matter.summary,
        "version": getattr(matter, "version", 1),
        "status": getattr(matter, "status", "published"),
        "act_type_id": str(matter.act_type_id) if matter.act_type_id else None,
        "org_unit_id": str(matter.org_unit_id) if matter.org_unit_id else None,
        # ── Act identification / responsible snapshot (frozen at close) ──
        "act_number": getattr(matter, "act_number", None),
        "act_year": getattr(matter, "act_year", None),
        "act_date": _iso_date(getattr(matter, "act_date", None)),
        "publication_type": getattr(matter, "publication_type", "normal"),
        "references_matter_id": (
            str(matter.references_matter_id)
            if getattr(matter, "references_matter_id", None) else None
        ),
        "responsible": responsible,
        "metadata": metadata,
        "content_mode": getattr(matter, "content_mode", "rich_text"),
        "content_html": getattr(matter, "content_html", ""),
        "content_json": getattr(matter, "content_json", None),
        "semantic": semantic.model_dump(mode="json") if semantic else None,
        "semantic_hash": semantic_hash,
        "semantic_schema_version": getattr(matter, "semantic_schema_version", None),
        "template_id": getattr(matter, "template_id", None),
        "template_version": getattr(matter, "template_version", None),
        "text_integrity_hash": getattr(matter, "text_integrity_hash", None),
        "source_hash": getattr(matter, "source_hash", None),
        "attachments": attachments,
    }


def build_publication_snapshot(
    edition,
    matters: list,
    *,
    template_snapshots: Optional[list[dict]] = None,
    attachments_by_matter: Optional[dict] = None,
    renderer_version: str = "semantic-renderer/1.0",
) -> dict[str, Any]:
    """Build the full immutable snapshot dict for an edition.

    ``matters`` is a list of ``(matter, position, section_title)`` tuples in
    publication order. ``attachments_by_matter`` maps matter_id -> list of
    attachment dicts (avoids lazy ORM loads).
    """
    items = []
    for (m, pos, section) in matters:
        atts = None
        if attachments_by_matter is not None:
            atts = attachments_by_matter.get(str(m.id))
        items.append(
            matter_snapshot(m, position=pos, section_title=section,
                            attachments_override=atts)
        )

    manifest = {
        "schema": "edition_publication_snapshot",
        "schema_version": 1,
        "edition_id": str(edition.id),
        "organization_id": str(edition.organization_id),
        "year": edition.year,
        "number": edition.number,
        "type": _enum_value(edition.type),
        "title": edition.title,
        "subtitle": getattr(edition, "subtitle", None),
        "publication_date": _iso_date(edition.publication_date),
        "verification_code": getattr(edition, "verification_code", None),
        "renderer_version": renderer_version,
        "templates": template_snapshots or [],
        "items": items,
    }

    content_manifest_hash = hashlib.sha256(
        json.dumps(manifest, sort_keys=True, ensure_ascii=False, default=str)
        .encode("utf-8")
    ).hexdigest()

    snapshot = dict(manifest)
    snapshot["content_manifest_hash"] = content_manifest_hash
    snapshot["frozen_at"] = datetime.now(timezone.utc).isoformat()
    # Guarantee the dict is fully JSON-serializable (JSONB insert) — any UUIDs,
    # dates, enums etc. become plain str.
    return json.loads(json.dumps(snapshot, sort_keys=True, default=str))


def _enum_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _iso_date(value: date) -> str:
    if value is None:
        return None
    return value.isoformat() if isinstance(value, date) else str(value)


def verify_snapshot(snapshot: dict) -> tuple[bool, str]:
    """Verify an already-frozen snapshot's content_manifest_hash.

    Recomputes the manifest hash over the same canonical fields and compares
    to ``content_manifest_hash``. Returns ``(ok, reason)``.
    """
    stored = snapshot.get("content_manifest_hash")
    if not stored:
        return False, "snapshot sem content_manifest_hash"
    recomputed = recompute_manifest_hash(snapshot)
    if recomputed != stored:
        return False, "content_manifest_hash divergente (snapshot alterado)"
    return True, "snapshot íntegro"


def recompute_manifest_hash(snapshot: dict) -> str:
    canonical = {
        "schema": snapshot.get("schema"),
        "schema_version": snapshot.get("schema_version"),
        "edition_id": snapshot.get("edition_id"),
        "organization_id": snapshot.get("organization_id"),
        "year": snapshot.get("year"),
        "number": snapshot.get("number"),
        "type": snapshot.get("type"),
        "title": snapshot.get("title"),
        "subtitle": snapshot.get("subtitle"),
        "publication_date": snapshot.get("publication_date"),
        "verification_code": snapshot.get("verification_code"),
        "renderer_version": snapshot.get("renderer_version"),
        "templates": snapshot.get("templates", []),
        "items": snapshot.get("items", []),
    }
    return hashlib.sha256(
        json.dumps(canonical, sort_keys=True, ensure_ascii=False, default=str)
        .encode("utf-8")
    ).hexdigest()
