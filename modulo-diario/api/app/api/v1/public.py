"""Public API endpoints - no authentication required. Only returns PUBLISHED data."""

import os
import uuid
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.tenant import require_tenant, resolve_tenant_from_domain
from app.core.storage import set_storage_tenant
from app.models.edition import Edition
from app.models.edition_item import EditionItem
from app.models.enums import EditionStatus
from app.models.matter import Matter
from app.models.matter_attachment import MatterAttachment
from app.models.organization import Organization
from app.models.signature import Signature

router = APIRouter(tags=["public"])

limiter = Limiter(key_func=get_remote_address)


def _count_pdf_pages(path: Path) -> int | None:
    try:
        content = path.read_bytes()
    except OSError:
        return None
    page_markers = content.count(b"/Type /Page")
    pages_markers = content.count(b"/Type /Pages")
    count = page_markers - pages_markers
    return count if count > 0 else None


def _resolve_upload_path(file_path: str, tenant_slug: str | None = None) -> Path | None:
    clean_path = Path(file_path)
    if clean_path.is_absolute() or ".." in clean_path.parts:
        return None

    base_dir = Path(settings.UPLOAD_DIR).resolve()

    if settings.STORAGE_TENANT_ISOLATION and tenant_slug:
        prefix = Path(tenant_slug)
        candidates = [
            (base_dir / prefix / clean_path).resolve(),
            (base_dir / prefix / "pdf" / clean_path).resolve(),
        ]
        return next(
            (
                path for path in candidates
                if str(path).startswith(str(base_dir)) and path.exists() and path.is_file()
            ),
            None,
        )

    candidates = [
        (base_dir / clean_path).resolve(),
        (base_dir / "pdf" / clean_path).resolve(),
    ]

    return next(
        (
            path for path in candidates
            if str(path).startswith(str(base_dir)) and path.exists() and path.is_file()
        ),
        None,
    )


def _public_pdf_path(edition: Edition, tenant_slug: str | None = None) -> str | None:
    if edition.signed_pdf_path:
        for signature in edition.signatures or []:
            certificate_info = signature.certificate_info or {}
            if certificate_info.get("sha256_signed") == edition.pdf_hash:
                signed_path = _resolve_upload_path(edition.signed_pdf_path, tenant_slug)
                if signed_path is not None:
                    return edition.signed_pdf_path
                break
    if edition.pdf_path:
        pdf_path = _resolve_upload_path(edition.pdf_path, tenant_slug)
        if pdf_path is not None:
            return edition.pdf_path
    if edition.signed_pdf_path:
        signed_path = _resolve_upload_path(edition.signed_pdf_path, tenant_slug)
        if signed_path is not None:
            return edition.signed_pdf_path
    return edition.pdf_path  # fallback


@router.get("/public/organization")
async def public_get_organization(
    tenant: Organization = Depends(require_tenant),
):
    """Return public configuration for the organization identified by the domain."""
    theme = tenant.theme_config or {}
    return {
        "id": str(tenant.id),
        "name": tenant.name,
        "slug": tenant.slug,
        "logo_url": tenant.logo_url,
        "description": tenant.description,
        "theme": {
            "primary_color": theme.get("primary_color", "#1a56db"),
            "secondary_color": theme.get("secondary_color", "#7c3aed"),
            "font_family": theme.get("font_family", "Inter, sans-serif"),
        },
    }


@router.get("/public/download/{file_path:path}")
@limiter.limit("120/minute")
async def public_download(
    request: Request, file_path: str, inline: bool = False,
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
):
    tenant_slug = tenant.slug if tenant else None
    if settings.STORAGE_TENANT_ISOLATION and not tenant_slug:
        raise HTTPException(status_code=400, detail="Tenant context required for file download")
    if tenant_slug:
        set_storage_tenant(tenant_slug)
    full_path = _resolve_upload_path(file_path, tenant_slug)
    if full_path is None and (Path(file_path).is_absolute() or ".." in Path(file_path).parts):
        raise HTTPException(status_code=400, detail="Invalid file path")
    if full_path is None:
        raise HTTPException(status_code=404, detail="File not found")

    content = full_path.read_bytes()
    filename = Path(file_path).name or "documento.pdf"
    media_type = "application/pdf" if filename.lower().endswith(".pdf") else "application/octet-stream"
    disposition = "inline" if inline else "attachment"
    headers = {
        "Content-Disposition": f'{disposition}; filename="{filename}"',
        "Content-Length": str(len(content)),
    }
    if filename.lower().endswith(".pdf"):
        import hashlib

        headers["X-SHA256-Signed"] = hashlib.sha256(content).hexdigest()

    return Response(content=content, media_type=media_type, headers=headers)


@router.get("/public/editions")
@limiter.limit("60/minute")
async def public_list_editions(
    request: Request,
    year: Optional[int] = None,
    type: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
):
    query = (
        select(Edition)
        .where(Edition.status == EditionStatus.PUBLISHED)
        .options(selectinload(Edition.items), selectinload(Edition.signatures))
    )
    if tenant:
        query = query.where(Edition.organization_id == tenant.id)
    if year:
        query = query.where(Edition.year == year)
    if type:
        query = query.where(Edition.type == type)
    if search:
        like = f"%{search}%"
        query = query.where(
            or_(Edition.title.ilike(like), Edition.subtitle.ilike(like))
        )
    query = query.order_by(Edition.year.desc(), Edition.number.desc())
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    editions = result.scalars().all()

    return [
        {
            "id": str(e.id),
            "number": e.number,
            "year": e.year,
            "type": e.type,
            "title": e.title,
            "subtitle": e.subtitle,
            "publication_date": e.publication_date.isoformat() if e.publication_date else None,
            "verification_code": e.verification_code,
            "item_count": len(e.items or []),
            "signature_count": len(e.signatures or []),
        }
        for e in editions
    ]


@router.get("/public/editions/{year}/{number}")
@limiter.limit("60/minute")
async def public_get_edition(
    year: int,
    number: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
):
    filters = [
        Edition.year == year,
        Edition.number == number,
        Edition.status == EditionStatus.PUBLISHED,
    ]
    if tenant:
        filters.append(Edition.organization_id == tenant.id)
    result = await db.execute(
        select(Edition)
        .where(*filters)
        .options(
            selectinload(Edition.items).selectinload(EditionItem.matter)
                .selectinload(Matter.act_type),
            selectinload(Edition.items).selectinload(EditionItem.matter)
                .selectinload(Matter.org_unit),
            selectinload(Edition.signatures),
        )
    )
    edition = result.scalar_one_or_none()
    if edition is None:
        raise HTTPException(status_code=404, detail="Edition not found")

    items = []
    for item in sorted(edition.items or [], key=lambda i: i.position):
        m = item.matter
        items.append({
            "id": str(item.id),
            "position": item.position,
            "section_title": item.section_title,
            "page_number": item.page_number,
            "matter": {
                "id": str(m.id) if m else None,
                "title": m.title if m else "",
                "summary": m.summary,
                "content_html": m.content_html if m else "",
                "act_type": m.act_type.name if m and m.act_type else "",
                "org_unit": m.org_unit.abbreviation if m and m.org_unit else "",
            } if m else None,
        })

    sigs = []
    for s in edition.signatures or []:
        ci = s.certificate_info or {}
        sigs.append({
            "signed_at": s.signed_at.isoformat() if s.signed_at else None,
            "certificate_info": ci,
            "verification_code": ci.get("verification_code") or edition.verification_code,
        })

    page_count = None
    tenant_slug = tenant.slug if tenant else None
    public_pdf_path = _public_pdf_path(edition, tenant_slug)
    if public_pdf_path:
        pdf_full_path = _resolve_upload_path(public_pdf_path, tenant_slug)
        if pdf_full_path:
            page_count = _count_pdf_pages(pdf_full_path)

    api_base = str(request.base_url).rstrip("/")
    pdf_url = f"{api_base}/api/v1/public/download/{public_pdf_path}?inline=1" if public_pdf_path else None
    return {
        "id": str(edition.id),
        "number": edition.number,
        "year": edition.year,
        "type": edition.type,
        "title": edition.title,
        "subtitle": edition.subtitle,
        "publication_date": edition.publication_date.isoformat() if edition.publication_date else None,
        "pdf_path": public_pdf_path,
        "pdf_url": pdf_url,
        "pdf_hash": edition.pdf_hash,
        "verification_code": edition.verification_code,
        "immutability_hash": edition.immutability_hash,
        "published_at": edition.published_at.isoformat() if edition.published_at else None,
        "page_count": page_count,
        "items": items,
        "signatures": sigs,
    }


@router.get("/public/matters/{matter_id}")
@limiter.limit("60/minute")
async def public_get_matter(
    request: Request,
    matter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
):
    filters = [Matter.id == matter_id, Matter.status == "published"]
    if tenant:
        filters.append(Matter.organization_id == tenant.id)
    result = await db.execute(
        select(Matter)
        .where(*filters)
        .options(
            selectinload(Matter.act_type),
            selectinload(Matter.org_unit),
            selectinload(Matter.author),
            selectinload(Matter.attachments).selectinload(MatterAttachment.file),
        )
    )
    matter = result.scalar_one_or_none()
    if matter is None:
        raise HTTPException(status_code=404, detail="Matter not found")

    attachments = []
    for att in matter.attachments or []:
        attachments.append({
            "id": str(att.id),
            "title": att.title,
            "type": att.type,
            "file": {
                "filename": att.file.filename if att.file else None,
                "mime_type": att.file.mime_type if att.file else None,
                "size_bytes": att.file.size_bytes if att.file else None,
            } if att.file else None,
        })

    edition_info = None
    signature_info = None
    edition_result = await db.execute(
        select(Edition)
        .join(EditionItem, EditionItem.edition_id == Edition.id)
        .where(
            EditionItem.matter_id == matter.id,
            Edition.status == EditionStatus.PUBLISHED,
        )
        .options(
            selectinload(Edition.signatures).selectinload(Signature.credential),
        )
        .order_by(Edition.publication_date.desc(), Edition.number.desc())
        .limit(1)
    )
    edition = edition_result.scalar_one_or_none()
    if edition:
        edition_info = {
            "id": str(edition.id),
            "number": edition.number,
            "year": edition.year,
            "title": edition.title,
            "publication_date": edition.publication_date.isoformat() if edition.publication_date else None,
            "verification_code": edition.verification_code,
            "pdf_hash": edition.pdf_hash,
            "immutability_hash": edition.immutability_hash,
        }
        sig = edition.signatures[0] if edition.signatures else None
        if sig:
            ci = sig.certificate_info or {}
            signature_info = {
                "signed_at": sig.signed_at.isoformat() if sig.signed_at else None,
                "certificate_label": sig.credential.label if sig.credential else "",
                "certificate_subject": ci.get("subject", ""),
                "certificate_serial": ci.get("serial", ""),
                "certificate_thumbprint": ci.get("thumbprint", ""),
            }

    return {
        "id": str(matter.id),
        "title": matter.title,
        "summary": matter.summary,
        "content_html": matter.content_html,
        "act_type": matter.act_type.name if matter.act_type else "",
        "org_unit": matter.org_unit.abbreviation if matter.org_unit else "",
        "author": matter.author.name if matter.author else "",
        "published_at": matter.published_at.isoformat() if matter.published_at else None,
        "attachments": attachments,
        "edition": edition_info,
        "signature": signature_info,
    }


@router.get("/public/search")
@limiter.limit("30/minute")
async def public_search(
    request: Request,
    q: str = Query("", min_length=1),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    org_unit: Optional[str] = None,
    act_type: Optional[str] = None,
    page: int = Query(0, ge=0),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
):
    from app.services.search_indexer import get_search_provider

    provider = get_search_provider()
    results, total = await provider.search(
        query=q, db=db,
        date_from=date_from,
        date_to=date_to,
        org_unit=org_unit,
        act_type=act_type,
        organization_id=tenant.id if tenant else None,
        page=page,
        page_size=page_size,
    )

    return {
        "results": [
            {
                "matter_id": r.matter_id,
                "title": r.title,
                "act_type": r.act_type,
                "org_unit": r.org_unit,
                "snippet": r.snippet,
                "edition_number": r.edition_number,
                "publication_date": r.publication_date,
                "rank": r.rank,
            }
            for r in results
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/public/verify/{code}")
@limiter.limit("30/minute")
async def public_verify(
    request: Request,
    code: str,
    db: AsyncSession = Depends(get_db),
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
):
    filters = [Edition.verification_code == code]
    if tenant:
        filters.append(Edition.organization_id == tenant.id)
    result = await db.execute(
        select(Edition)
        .where(*filters)
        .options(selectinload(Edition.signatures))
    )
    edition = result.scalar_one_or_none()
    if edition is None:
        return {"valid": False, "message": "Verification code not found"}

    sig_info = {}
    if edition.signatures:
        s = edition.signatures[0]
        sig_info = {
            "signed_at": s.signed_at.isoformat() if s.signed_at else None,
            "certificate_subject": (s.certificate_info or {}).get("subject", ""),
            "certificate_serial": (s.certificate_info or {}).get("serial", ""),
            "certificate_thumbprint": (s.certificate_info or {}).get("thumbprint", ""),
        }

    return {
        "valid": True,
        "edition": {
            "id": str(edition.id),
            "number": edition.number,
            "year": edition.year,
            "title": edition.title,
            "publication_date": edition.publication_date.isoformat() if edition.publication_date else None,
            "pdf_hash": edition.pdf_hash,
            "immutability_hash": edition.immutability_hash,
            "verification_code": edition.verification_code,
        },
        "signature": sig_info,
        "message": "Document verified successfully",
    }


@router.post("/public/verify-pdf")
@limiter.limit("30/minute")
async def public_verify_pdf(request: Request, body: dict):
    """Public endpoint to verify a signed PDF. No authentication required."""
    signed_pdf_base64 = body.get("signed_pdf_base64")
    if not signed_pdf_base64:
        from fastapi import HTTPException
        raise HTTPException(400, "signed_pdf_base64 is required")

    try:
        import httpx
        from app.core.config import settings

        async with httpx.AsyncClient() as http_client:
            resp = await http_client.post(
                f"{settings.SIGNER_URL}/internal/verify-pdf",
                json={"signed_pdf_base64": signed_pdf_base64},
                headers={"X-Internal-Key": settings.INTERNAL_API_KEY.get_secret_value()},
                timeout=60,
            )
        if resp.status_code != 200:
            raise RuntimeError(f"Verifier error: {resp.text}")
        return resp.json()
    except httpx.RequestError as e:
        from fastapi import HTTPException
        raise HTTPException(502, f"Verification service unavailable: {e}")
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(500, f"Verification failed: {e}")


@router.post("/public/verify-code")
@limiter.limit("30/minute")
async def public_verify_code(request: Request, body: dict):
    """Public endpoint to look up signing info by verification code."""
    code = (body.get("code") or "").strip().upper()
    if not code:
        from fastapi import HTTPException
        raise HTTPException(400, "code is required")

    from app.core.database import async_session
    from app.models.signing_document import SigningDocument
    from sqlalchemy import select

    async with async_session() as db:
        result = await db.execute(
            select(SigningDocument).where(SigningDocument.verification_code == code)
        )
        doc = result.scalar_one_or_none()

    if not doc:
        return {"valid": False, "message": "Codigo de validacao nao encontrado"}

    return {
        "valid": True,
        "document": {
            "filename": doc.filename,
            "sha256_signed": doc.sha256_signed,
            "signed_at": doc.signed_at.isoformat() if doc.signed_at else None,
            "certificate_subject": doc.certificate_subject,
            "certificate_serial": doc.certificate_serial,
            "verification_code": doc.verification_code,
        },
        "message": "Documento assinado digitalmente encontrado",
    }
