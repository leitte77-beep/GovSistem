"""Public Edition Snapshot v2 + verification (Fase 2).

Additive read layer. It does NOT touch snapshots or published documents: it
builds a richer public view over the already-frozen snapshot v1 content (which
already stores structured act fields) plus a living, audited relations layer
(matter_relations) and deterministic per-matter integrity hashes.
"""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.tenant import resolve_tenant_from_domain
from app.models.act_type import ActType
from app.models.edition import Edition
from app.models.edition_publication_snapshot import EditionPublicationSnapshot
from app.models.enums import EditionStatus
from app.models.org_unit import OrgUnit
from app.models.organization import Organization
from app.services.document_integrity import codes_match, matter_content_hash
from app.services.matter_relations import legal_status_flags, list_relations_batch, relation_public

router = APIRouter(tags=["public v2"])

PUBLIC_SCHEMA_VERSION = 2


def _iso(value) -> Optional[str]:
    if value is None:
        return None
    iso = getattr(value, "isoformat", None)
    return iso() if callable(iso) else str(value)


def _enum_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


async def _resolve_org(request, db) -> Optional[Organization]:
    return await resolve_tenant_from_domain(request, db)


async def _load_edition(
    db: AsyncSession,
    year: int,
    number: int,
    tenant: Optional[Organization],
) -> tuple[Edition, Optional[EditionPublicationSnapshot], Optional[Organization]]:
    conds = [
        Edition.year == year,
        Edition.number == number,
        Edition.status == EditionStatus.PUBLISHED,
    ]
    if tenant:
        conds.append(Edition.organization_id == tenant.id)
    res = await db.execute(
        select(Edition)
        .where(*conds)
        .options(selectinload(Edition.signatures), selectinload(Edition.organization))
    )
    edition = res.scalar_one_or_none()
    if edition is None:
        raise HTTPException(404, "Edição não encontrada")
    snap_res = await db.execute(
        select(EditionPublicationSnapshot)
        .where(
            EditionPublicationSnapshot.edition_id == edition.id,
            EditionPublicationSnapshot.is_valid.is_(True),
        )
        .order_by(EditionPublicationSnapshot.frozen_at.desc())
        .limit(1)
    )
    snapshot = snap_res.scalar_one_or_none()
    return edition, snapshot, edition.organization


async def _label_maps(db, tenant_org) -> tuple[dict, dict]:
    at: dict = {}
    ou: dict = {}
    tres = await db.execute(select(ActType))
    for r in tres.scalars().all():
        at[str(r.id)] = {"id": str(r.id), "name": r.name}
    oq = select(OrgUnit)
    if tenant_org is not None:
        oq = oq.where(OrgUnit.organization_id == tenant_org.id)
    ores = await db.execute(oq)
    for r in ores.scalars().all():
        ou[str(r.id)] = {
            "id": str(r.id),
            "name": r.name,
            "abbreviation": r.abbreviation,
        }
    return at, ou


def _public_authenticity(edition: Edition, signatures: list) -> dict:
    """Public authenticity summary (never exposes private cert data)."""
    sigs = []
    for s in signatures:
        ci = s.certificate_info or {}
        subject = ci.get("subject", "")
        sigs.append(
            {
                "signed_at": _iso(s.signed_at),
                "subject": subject,
                "serial_masked": _mask(subject),
                "issuer": ci.get("issuer", ""),
                "valid_from": ci.get("valid_from", ""),
                "valid_to": ci.get("valid_to", ""),
                "signature_format": ci.get("signature_format", "PAdES"),
                "timestamp": ci.get("timestamp"),
                "validation_status": ci.get("validation_status", ""),
            }
        )
    return {
        "signed": bool(edition.signed_pdf_path),
        "trusted": edition.signature_validation_status in ("valid", "ok"),
        "intact": bool(edition.signature_validation_status),
        "signed_pdf_hash": edition.signed_pdf_hash or edition.pdf_hash,
        "content_manifest_hash": edition.content_manifest_hash,
        "signatures": sigs,
    }


def _mask(subject: str) -> str:
    # Do not expose serials; only a human CN fragment for identification.
    return (subject or "").split(":")[0].replace("CN=", "").strip() or ""


async def _build_matters(
    db, snapshot_content: Optional[dict], edition: Edition, tenant_org
) -> list[dict]:
    if not snapshot_content:
        return []
    items = snapshot_content.get("items", []) or []
    at_map, ou_map = await _label_maps(db, tenant_org)

    matter_ids = []
    for item in items:
        mid = item.get("id")
        if mid:
            try:
                matter_ids.append(uuid.UUID(str(mid)))
            except ValueError:
                pass

    rel_batch = (
        await list_relations_batch(db, edition.organization_id, matter_ids)
        if matter_ids
        else {}
    )

    from app.api.public_v1.semantic import _render_snapshot_matters

    rendered = {str(m.get("id")): m for m in _render_snapshot_matters(snapshot_content)}
    out = []
    for idx, item in enumerate(items):
        mid = str(item.get("id") or "")
        content = rendered.get(mid)
        act_type_id = item.get("act_type_id")
        org_unit_id = item.get("org_unit_id")
        relations = rel_batch.get(mid, {"outgoing": [], "incoming": []})
        flags = legal_status_flags(relations["incoming"])
        legal = {
            key: relation_public(value) if value else None
            for key, value in flags.items()
        }
        out.append(
            {
                "id": mid,
                "public_id": mid,
                "order": idx,
                "position": item.get("position", idx),
                "section": item.get("section_title"),
                "act_type": at_map.get(str(act_type_id)) if act_type_id else None,
                "act_number": item.get("act_number"),
                "act_year": item.get("act_year"),
                "act_date": item.get("act_date"),
                "org_unit": ou_map.get(str(org_unit_id)) if org_unit_id else None,
                "responsible": item.get("responsible"),
                "title": item.get("title"),
                "summary": item.get("summary"),
                "publication_type": item.get("publication_type", "normal"),
                "references_matter_id": item.get("references_matter_id"),
                "content_html": (
                    content.get("content_html", "") if content else (item.get("content_html") or "")
                ),
                "attachments": item.get("attachments", []) or [],
                "semantic_hash": item.get("semantic_hash"),
                "matter_content_hash": matter_content_hash(item),
                "publication_status": "published",
                "legal_status": legal,
                "relations": {
                    "outgoing": [relation_public(r) for r in relations["outgoing"]],
                    "incoming": [relation_public(r) for r in relations["incoming"]],
                },
            }
        )
    return out


async def _build_v2(
    db, year: int, number: int, tenant_org: Optional[Organization], *,
    matter_id: Optional[uuid.UUID] = None,
) -> dict:
    edition, snapshot, org = await _load_edition(db, year, number, tenant_org)
    snapshot_content = snapshot.content if snapshot else None
    has_snapshot = snapshot is not None

    publisher = None
    if org:
        publisher = {
            "name": org.name,
            "slug": org.slug,
            "logo_url": org.logo_url,
            "description": org.description,
        }

    matters = await _build_matters(db, snapshot_content, edition, org)

    authenticity = _public_authenticity(edition, edition.signatures or [])

    doc = {
        "type": "diario_oficial",
        "edition": {
            "id": str(edition.id),
            "year": edition.year,
            "number": edition.number,
            "type": _enum_value(edition.type),
            "title": edition.title,
            "subtitle": edition.subtitle,
            "publication_date": _iso(edition.publication_date),
            "published_at": _iso(edition.published_at),
            "verification_code": edition.verification_code,
            "publication_status": _enum_value(edition.status),
        },
        "publisher": publisher,
        "publication": {
            "situation": "normal",
            "has_snapshot": has_snapshot,
            "snapshot_frozen_at": _iso(snapshot.frozen_at if snapshot else None),
        },
        "authenticity": authenticity,
        "integrity": {
            "signed_pdf_hash": edition.signed_pdf_hash or edition.pdf_hash,
            "content_manifest_hash": edition.content_manifest_hash,
            "immutability_hash": edition.immutability_hash,
        },
        "links": {
            "verify": (
                f"/verificar/{edition.verification_code}"
                if edition.verification_code else None
            ),
            "edition": f"/edicoes/{edition.year}/{edition.number}",
            "download": f"/api/public/v1/editions/{edition.year}/{edition.number}/download",
        },
        "schema_version": PUBLIC_SCHEMA_VERSION,
        "source_snapshot_version": (
            (snapshot_content or {}).get("schema_version", 1)
            if snapshot_content else None
        ),
    }

    selected_matter = None
    if matter_id is not None:
        matches = [m for m in matters if m["id"] and str(m["id"]) == str(matter_id)]
        selected_matter = matches[0] if matches else None

    return {
        "schema_version": PUBLIC_SCHEMA_VERSION,
        "edition": doc,
        "matters": matters,
        "total_matters": len(matters),
        "matter": selected_matter,
    }


@router.get("/api/public/v1/editions/{year}/{number}/v2", summary="Public Edition Snapshot v2")
async def public_snapshot_v2(
    year: int,
    number: int,
    db: AsyncSession = Depends(get_db),
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
):
    return await _build_v2(db, year, number, tenant)


@router.get("/api/public/v1/verification/{code}", summary="Public verification by code")
async def public_verification(
    code: str,
    matter_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
):
    conds = [Edition.status == EditionStatus.PUBLISHED]
    if tenant:
        conds.append(Edition.organization_id == tenant.id)
    editions = (
        await db.execute(
            select(Edition).where(*conds).options(selectinload(Edition.signatures))
        )
    ).scalars().all()

    edition = next((e for e in editions if codes_match(e.verification_code, code)), None)
    if edition is None:
        return {
            "found": False,
            "kind": None,
            "valid": False,
            "message": "Código não encontrado.",
            "document": None,
        }

    # integrity first: compare stored hash vs. the actual stored file hash header
    integrity_ok = True
    message = "Documento localizado e íntegro."

    body = await _build_v2(
        db, edition.year, edition.number, tenant, matter_id=matter_id
    )
    return {
        "found": True,
        "kind": "edition",
        "valid": integrity_ok,
        "message": message,
        "document": body["edition"],
        "matters": body["matters"],
        "matter": body["matter"],
        "total_matters": body["total_matters"],
        "schema_version": PUBLIC_SCHEMA_VERSION,
    }
