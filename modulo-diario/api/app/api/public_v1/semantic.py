"""Public semantic edition page + immutable PDF download (Fase 12/13/14).

The public page is rendered from the immutable snapshot, never from the live
editable matters. The PDF is generated/signed ONCE at publication and stored;
every download returns the exact same bytes (SHA-256 is re-checked). No
regeneration, no re-signing.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.feature_flags import is_feature_enabled
from app.core.tenant import resolve_tenant_from_domain
from app.models.edition import Edition
from app.models.edition_publication_snapshot import EditionPublicationSnapshot
from app.models.enums import EditionStatus
from app.models.matter import Matter
from app.models.organization import Organization
from app.models.publication_artifact import PublicationArtifact
from app.models.signature import Signature
from app.semantic.renderer import render_document
from app.semantic.schemas import SemanticDocument
from app.semantic.snapshot import verify_snapshot
from app.semantic.templates import default_config_for
from app.services.matter_relations import list_relations_batch, relation_public
from app.services.publication_title import display_title
from app.services.signature_validation import (
    REVOCATION_CHECKED_VALUES,
    TIMESTAMP_PRESENT_VALUES,
    certificate_valid_at,
)

router = APIRouter(tags=["public semantic"])
limiter = Limiter(key_func=get_remote_address)


async def _resolve_tenant(request: Request, db: AsyncSession) -> Optional[Organization]:
    return await resolve_tenant_from_domain(request, db)


def _find_edition_conditions(year: int, number: int, tenant: Optional[Organization]):
    conds = [
        Edition.year == year,
        Edition.number == number,
        Edition.status == EditionStatus.PUBLISHED,
    ]
    if tenant:
        conds.append(Edition.organization_id == tenant.id)
    return conds


async def _load_edition_and_snapshot(
    year: int, number: int, tenant: Optional[Organization], db: AsyncSession
) -> tuple[Edition, Optional[EditionPublicationSnapshot], Optional[Organization]]:
    result = await db.execute(
        select(Edition)
        .where(*_find_edition_conditions(year, number, tenant))
        .order_by(Edition.created_at.desc())
        .options(
            selectinload(Edition.signatures),
            selectinload(Edition.organization),
        )
    )
    # Números são únicos por (org, ano, tipo); normal e extra podem compartilhar
    # o número. `.first()` com ordem determinística evita MultipleResultsFound.
    edition = result.scalars().first()
    if edition is None:
        raise HTTPException(404, "Edição não encontrada")

    snap_result = await db.execute(
        select(EditionPublicationSnapshot)
        .where(
            EditionPublicationSnapshot.edition_id == edition.id,
            EditionPublicationSnapshot.is_valid.is_(True),
        )
        .order_by(EditionPublicationSnapshot.frozen_at.desc())
        .limit(1)
    )
    snapshot = snap_result.scalar_one_or_none()
    return edition, snapshot, edition.organization


async def _load_artifacts(snapshot_id, db: AsyncSession) -> list[PublicationArtifact]:
    if not snapshot_id:
        return []
    result = await db.execute(
        select(PublicationArtifact)
        .where(PublicationArtifact.snapshot_id == snapshot_id)
        .order_by(PublicationArtifact.artifact_type, PublicationArtifact.generated_at)
    )
    return list(result.scalars().all())


async def _slug_by_matter(db: AsyncSession, matter_ids: list[uuid.UUID]) -> dict[str, str]:
    """Map matter id -> canonical slug for a batch of matters.

    The slug is the canonical public URL segment; it lives on the live matter
    (stable after publication) and is never part of the frozen snapshot, so
    reading it here cannot alter snapshot integrity.
    """
    if not matter_ids:
        return {}
    from app.services.matter_slug import matter_slug

    rows = (await db.execute(
        select(Matter)
        .where(Matter.id.in_(list(set(matter_ids))))
        .options(selectinload(Matter.act_type))
    )).scalars().all()
    return {str(m.id): matter_slug(m, m.act_type) for m in rows}


def _render_snapshot_matters(
    snapshot: dict,
    template_slug: str | None = None,
    relations_by_matter: Optional[dict] = None,
    slug_by_matter: Optional[dict] = None,
) -> list[dict]:
    """Render each matter from the frozen snapshot into safe HTML.

    The template config is resolved from the document's own ``document_type``
    (falling back to the explicit slug / "outro"), exactly like the PDF path, so
    the public page and the PDF can never render different layouts.
    """
    matters_out = []
    for item in snapshot.get("items", []):
        html = ""
        semantic = item.get("semantic")
        if semantic:
            try:
                doc = SemanticDocument.model_validate(semantic)
                config = default_config_for(
                    template_slug or doc.document_type or "outro"
                )
                # The edition shell already prints the matter title (banner);
                # only the renderer prints the súmula.
                html = render_document(
                    doc, config, media="screen", include_title=False
                )
            except Exception:  # noqa: BLE001
                html = item.get("content_html") or ""
        else:
            html = item.get("content_html") or ""
        matter_key = str(item.get("id"))
        grouped = (relations_by_matter or {}).get(matter_key, {})
        relations = []
        for direction, rels in (
            ("outgoing", grouped.get("outgoing", [])),
            ("incoming", grouped.get("incoming", [])),
        ):
            for rel in rels:
                public = relation_public(rel)
                public["direction"] = direction
                relations.append(public)

        matters_out.append({
            "id": item.get("id"),
            "slug": (slug_by_matter or {}).get(str(item.get("id"))),
            "position": item.get("position"),
            "section_title": item.get("section_title"),
            "title": display_title(item),
            "summary": item.get("summary"),
            "content_html": html,
            # The semantic renderer owns title/summary placement. Consumers
            # use this to avoid a second presentation-layer summary.
            "has_semantic_content": bool(semantic),
            "attachments": item.get("attachments", []),
            "semantic_hash": item.get("semantic_hash"),
            # Retificação/substituição links (never alter the frozen edition).
            "publication_type": item.get("publication_type"),
            "references_matter_id": item.get("references_matter_id"),
            "relations": relations,
        })
    return matters_out


def _signature_timestamp(sig) -> Optional[str]:
    """Earliest valid RFC 3161 token for a signature, if one exists.

    Guards against MagicMock/duck-typed objects so a non-list relationship
    never produces a false positive.
    """
    records = getattr(sig, "timestamp_records", None)
    if not isinstance(records, (list, tuple)):
        return None
    for rec in records:
        # "present" means a real RFC 3161 token was embedded (its gen_time is
        # TSA-issued); "valid" additionally means the chain was validated.
        # Either is evidence enough to show the timestamp, never the local clock.
        validation_status = getattr(rec, "validation_status", None)
        token_status = getattr(rec, "status", None)
        if (
            validation_status in ("valid", "present")
            or token_status in ("valid", "present")
        ) and getattr(rec, "gen_time", None):
            return rec.gen_time.isoformat()
    return None


def _build_authenticity(edition: Edition, snapshot: Optional[dict]) -> dict:
    # The persisted result of the last validation run is authoritative. The
    # signer metadata is only a fallback, so a stale value can never
    # contradict a newer official result.
    details = edition.signature_validation_details or {}
    status = str(edition.signature_validation_status or "").lower()

    signatures = []
    for sig in (edition.signatures or []):
        ci = sig.certificate_info or {}
        subject = ci.get("subject", "")
        serial = ci.get("serial", "")
        masked_serial = _mask_serial(serial)
        document_match = re.search(
            r"(?<!\d)(\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}|\d{14})(?!\d)",
            subject,
        )
        certificate_document = (
            re.sub(r"\D", "", document_match.group(1)) if document_match else ""
        )
        # A real token only; the ordinary signing date is not a timestamp.
        timestamp = ci.get("timestamp") or _signature_timestamp(sig)
        signatures.append({
            "signed_at": sig.signed_at.isoformat() if sig.signed_at else None,
            "subject": subject,
            "certificate_document": certificate_document,
            "serial": serial,
            "serial_masked": masked_serial,
            "issuer": ci.get("issuer", ""),
            "valid_from": ci.get("valid_from", ""),
            "valid_to": ci.get("valid_to", ""),
            "signature_format": ci.get("signature_format", "PAdES"),
            "validation_status": ci.get("validation_status", ""),
            "sha256_signed": ci.get("sha256_signed", ""),
            "chain_trusted": bool(ci.get("chain_trusted")),
            "verified_at": ci.get("validated_at") or ci.get("verified_at"),
            "timestamp": timestamp,
            "verification_code": ci.get("verification_code") or edition.verification_code or "",
        })

    snapshot_ok = False
    snapshot_reason = "sem snapshot imutável"
    if snapshot:
        snapshot_ok, snapshot_reason = verify_snapshot(snapshot)

    has_signature = bool(signatures)

    # Integrity: an "invalid" status (or an absent one) must never be coerced
    # into True just because the column is non-empty.
    detail_integrity = details.get("integrity")
    if isinstance(detail_integrity, bool):
        intact = detail_integrity
    else:
        # "indeterminate" means the CMS was verified intact but the chain was
        # not; "valid" means both.
        intact = status in ("valid", "indeterminate")

    detail_chain = details.get("chain_trusted")
    if isinstance(detail_chain, bool):
        chain_trusted: Optional[bool] = detail_chain
    elif has_signature:
        chain_trusted = bool(signatures[0].get("chain_trusted"))
    else:
        chain_trusted = None

    if isinstance(details.get("certificate_valid"), bool):
        certificate_valid: Optional[bool] = details["certificate_valid"]
    elif has_signature:
        certificate_valid = certificate_valid_at(
            signatures[0].get("valid_from"),
            signatures[0].get("valid_to"),
            signatures[0].get("signed_at"),
        )
    else:
        certificate_valid = None

    revocation_status = str(details.get("revocation_status") or "").lower()
    revocation_checked: Optional[bool] = (
        revocation_status in REVOCATION_CHECKED_VALUES if revocation_status else None
    )

    timestamp_status = str(details.get("timestamp_status") or "").lower()
    if has_signature and signatures[0].get("timestamp"):
        timestamped: Optional[bool] = True
    elif timestamp_status:
        timestamped = timestamp_status in TIMESTAMP_PRESENT_VALUES
    else:
        timestamped = None

    trusted = bool(
        status in ("valid", "ok")
        and intact
        and chain_trusted is True
        and certificate_valid is not False
    )

    return {
        "verification_code": edition.verification_code or "",
        "signed_pdf_hash": edition.signed_pdf_hash or edition.pdf_hash,
        "content_manifest_hash": edition.content_manifest_hash or (snapshot or {}).get("content_manifest_hash"),
        "snapshot_intact": snapshot_ok,
        "snapshot_status": snapshot_reason,
        "validation_checked_at": details.get("validated_at"),
        "revocation_status": revocation_status or None,
        "timestamp_status": timestamp_status or None,
        "signatures": signatures,
        "states": {
            "signed": bool(edition.signed_pdf_path),
            "intact": intact,
            "trusted": trusted,
            "certificate_valid": certificate_valid,
            "chain_trusted": chain_trusted,
            "revocation_checked": revocation_checked,
            "timestamped": timestamped,
            "snapshot_intact": snapshot_ok,
        },
    }


def _mask_serial(serial: str) -> str:
    serial = serial or ""
    if len(serial) <= 6:
        return serial
    return serial[:2] + "…" + serial[-2:]


# ── Public page (from snapshot) ──────────────────────────────────────────────


@router.get(
    "/api/public/v1/editions/{year}/{number}/snapshot",
    summary="Public edition page rendered from the immutable snapshot",
)
@limiter.limit("60/minute")
async def public_snapshot_page(
    request: Request,
    year: int,
    number: int,
    db: AsyncSession = Depends(get_db),
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
):
    edition, snapshot, org = await _load_edition_and_snapshot(year, number, tenant, db)
    snapshot_data = snapshot.content if snapshot else None

    relations_by_matter: dict = {}
    slug_by_matter: dict = {}
    if snapshot_data:
        matter_ids = [
            uuid.UUID(str(item["id"]))
            for item in snapshot_data.get("items", [])
            if item.get("id")
        ]
        if matter_ids:
            relations_by_matter = await list_relations_batch(
                db, edition.organization_id, matter_ids
            )
            slug_by_matter = await _slug_by_matter(db, matter_ids)
    matters = (
        _render_snapshot_matters(
            snapshot_data,
            relations_by_matter=relations_by_matter,
            slug_by_matter=slug_by_matter,
        )
        if snapshot_data
        else []
    )
    authenticity = _build_authenticity(edition, snapshot_data)

    artifacts = await _load_artifacts(snapshot.id if snapshot else None, db)
    artifact_info = [
        {
            "id": str(a.id),
            "artifact_type": a.artifact_type,
            "storage_path": a.storage_path,
            "sha256": a.sha256,
            "size_bytes": a.size_bytes,
            "mime_type": a.mime_type,
            "validation_status": a.validation_status,
            "is_preview": a.is_preview,
        }
        for a in artifacts
    ]

    return {
        "edition": {
            "id": str(edition.id),
            "number": edition.number,
            "year": edition.year,
            "type": edition.type.value if hasattr(edition.type, "value") else str(edition.type),
            "title": edition.title,
            "subtitle": edition.subtitle,
            "publication_date": edition.publication_date.isoformat() if edition.publication_date else None,
            "verification_code": edition.verification_code or "",
            "organization": org.name if org else "",
            "slug": org.slug if org else "",
        },
        "snapshot": {
            "content_manifest_hash": (snapshot_data or {}).get("content_manifest_hash"),
            "frozen_at": snapshot.frozen_at.isoformat() if snapshot else None,
            "has_snapshot": snapshot is not None,
        },
        "authenticity": authenticity,
        "artifacts": artifact_info,
        "matters": matters,
        "total_matters": len(matters),
    }


@router.get(
    "/api/public/v1/editions/{year}/{number}/download",
    summary="Immutable signed PDF download (same bytes every time)",
)
@limiter.limit("120/minute")
async def public_snapshot_download(
    request: Request,
    year: int,
    number: int,
    inline: bool = False,
    db: AsyncSession = Depends(get_db),
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
):
    edition, snapshot, org = await _load_edition_and_snapshot(year, number, tenant, db)

    storage_path = edition.signed_pdf_path or edition.pdf_path
    expected_hash = edition.signed_pdf_hash or edition.pdf_hash
    if not storage_path:
        raise HTTPException(404, "PDF oficial não disponível")

    from app.core.public_utils import read_public_file

    content, mime = read_public_file(storage_path, org.slug if org else None)
    if content is None:
        raise HTTPException(404, "Arquivo PDF não encontrado no storage")

    actual_hash = hashlib.sha256(content).hexdigest()
    if expected_hash and actual_hash != expected_hash:
        raise HTTPException(409, "Hash do PDF diverge do registrado (arquivo alterado)")

    filename = f"diario-oficial-{edition.year}-{edition.number:04d}.pdf"
    disposition = "inline" if inline else "attachment"
    headers = {
        "Content-Disposition": f'{disposition}; filename="{filename}"',
        "Content-Length": str(len(content)),
        "X-SHA256-Signed": actual_hash,
        "X-Immutable": "true",
    }
    return Response(content=content, media_type=mime or "application/pdf", headers=headers)
