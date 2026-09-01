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
from app.models.organization import Organization
from app.models.publication_artifact import PublicationArtifact
from app.models.signature import Signature
from app.semantic.renderer import render_document
from app.semantic.schemas import SemanticDocument
from app.semantic.snapshot import verify_snapshot
from app.semantic.templates import default_config_for

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
        .options(
            selectinload(Edition.signatures),
            selectinload(Edition.organization),
        )
    )
    edition = result.scalar_one_or_none()
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


def _render_snapshot_matters(snapshot: dict, template_slug: str = "outro") -> list[dict]:
    """Render each matter from the frozen snapshot into safe HTML."""
    config = default_config_for(template_slug)
    matters_out = []
    for item in snapshot.get("items", []):
        html = ""
        semantic = item.get("semantic")
        if semantic:
            try:
                doc = SemanticDocument.model_validate(semantic)
                html = render_document(doc, config, media="screen")
            except Exception:  # noqa: BLE001
                html = item.get("content_html") or ""
        else:
            html = item.get("content_html") or ""
        matters_out.append({
            "id": item.get("id"),
            "position": item.get("position"),
            "section_title": item.get("section_title"),
            "title": item.get("title"),
            "summary": item.get("summary"),
            "content_html": html,
            "attachments": item.get("attachments", []),
            "semantic_hash": item.get("semantic_hash"),
        })
    return matters_out


def _build_authenticity(edition: Edition, snapshot: Optional[dict]) -> dict:
    signatures = []
    for sig in (edition.signatures or []):
        ci = sig.certificate_info or {}
        subject = ci.get("subject", "")
        serial = ci.get("serial", "")
        masked_serial = _mask_serial(serial)
        signatures.append({
            "signed_at": sig.signed_at.isoformat() if sig.signed_at else None,
            "subject": subject,
            "serial": serial,
            "serial_masked": masked_serial,
            "issuer": ci.get("issuer", ""),
            "valid_from": ci.get("valid_from", ""),
            "valid_to": ci.get("valid_to", ""),
            "signature_format": ci.get("signature_format", "PAdES"),
            "validation_status": ci.get("validation_status", ""),
            "sha256_signed": ci.get("sha256_signed", ""),
            "verified_at": ci.get("validated_at") or ci.get("verified_at"),
            "timestamp": ci.get("timestamp"),
            "verification_code": ci.get("verification_code") or edition.verification_code or "",
        })

    snapshot_ok = False
    snapshot_reason = "sem snapshot imutável"
    if snapshot:
        snapshot_ok, snapshot_reason = verify_snapshot(snapshot)

    validation_checked_at = None
    intact = bool(edition.signature_validation_status)
    trusted = edition.signature_validation_status in ("valid", "ok")
    # Derive independent sub-states from the last signature's certificate info
    # (only when a signature exists). None = não verificado / indisponível.
    certificate_valid = None
    revocation_checked = None
    timestamped = None
    if signatures:
        ci = signatures[0]
        cert_valid = _certificate_valid_now(ci.get("valid_to"))
        certificate_valid = cert_valid
        revocation_checked = True if ci.get("validation_status") else None
        timestamped = bool(ci.get("timestamp") or ci.get("signed_at"))
        validation_checked_at = ci.get("validated_at")
    return {
        "verification_code": edition.verification_code or "",
        "signed_pdf_hash": edition.signed_pdf_hash or edition.pdf_hash,
        "content_manifest_hash": edition.content_manifest_hash or (snapshot or {}).get("content_manifest_hash"),
        "snapshot_intact": snapshot_ok,
        "snapshot_status": snapshot_reason,
        "validation_checked_at": validation_checked_at,
        "signatures": signatures,
        "states": {
            "signed": bool(edition.signed_pdf_path),
            "intact": intact,
            "trusted": trusted,
            "certificate_valid": certificate_valid,
            "chain_trusted": trusted,  # requires real ICP-Brasil roots
            "revocation_checked": revocation_checked,
            "timestamped": timestamped,
            "snapshot_intact": snapshot_ok,
        },
    }


def _certificate_valid_now(valid_to: str | None) -> bool | None:
    """True when the certificate is still within its validity window.

    Returns None (não verificado) when there is no validity data.
    """
    if not valid_to:
        return None
    try:
        from datetime import datetime
        end = datetime.fromisoformat(str(valid_to).replace("Z", "+00:00"))
        return datetime.now(end.tzinfo) <= end
    except Exception:  # noqa: BLE001
        return None


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

    matters = _render_snapshot_matters(snapshot_data) if snapshot_data else []
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
