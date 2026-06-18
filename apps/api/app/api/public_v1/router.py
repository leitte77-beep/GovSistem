"""Public API v1 — versioned, rate-limited, documented, only published data."""

import math
import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.tenant import require_tenant, resolve_tenant_from_domain
from app.models.edition import Edition
from app.models.edition_item import EditionItem
from app.models.enums import EditionStatus
from app.models.matter import Matter
from app.models.matter_attachment import MatterAttachment
from app.models.organization import Organization

from .schemas import (
    EditionDetail,
    EditionItemPublic,
    EditionListResponse,
    EditionMatterPublic,
    EditionSummary,
    MatterAttachmentPublic,
    MatterDetailPublic,
    MatterListResponse,
    MatterSummary,
    PaginationMeta,
    VerifyResult,
)

router = APIRouter(tags=["Public API v1"])

PUBLIC_URL = settings.PUBLIC_URL or "http://localhost:7200"
limiter = Limiter(key_func=get_remote_address)


def _public_pdf_path(edition: Edition) -> Optional[str]:
    if edition.signed_pdf_path:
        for signature in edition.signatures or []:
            certificate_info = signature.certificate_info or {}
            if certificate_info.get("sha256_signed") == edition.pdf_hash:
                return edition.signed_pdf_path
    return edition.pdf_path


def _build_pdf_url(edition: Edition) -> Optional[str]:
    pdf_path = _public_pdf_path(edition)
    if pdf_path:
        base = settings.PUBLIC_URL or "http://localhost:7200"
        return f"{base}/api/download/{pdf_path}"
    return None


def _build_attachment_url(att: MatterAttachment) -> Optional[str]:
    if att.file and att.file.storage_path:
        return f"{PUBLIC_URL}/api/download/{att.file.storage_path}"
    return None


def _build_item_public(item: EditionItem) -> EditionItemPublic:
    matter = item.matter
    if matter:
        matter_public = EditionMatterPublic(
            id=matter.id,
            title=matter.title,
            summary=matter.summary or "",
            content_html=matter.content_html,
            act_type=matter.act_type.name if matter.act_type else "",
            org_unit=matter.org_unit.abbreviation if matter.org_unit else "",
            author=matter.author.name if matter.author else "",
        )
    else:
        matter_public = None
    return EditionItemPublic(
        id=item.id,
        position=item.position,
        section_title=item.section_title,
        matter_id=item.matter.id if item.matter else None,
        matter_title=item.matter.title if item.matter else "",
        matter=matter_public,
    )


def _edition_daily_summary(edition: Edition) -> Optional[str]:
    summaries = []
    for item in sorted(edition.items or [], key=lambda i: i.position):
        matter = item.matter
        if not matter:
            continue
        text = matter.summary or matter.title
        if text:
            summaries.append(text.strip())
    return " ".join(summaries) or None


def _certificate_identity(subject: str | None) -> tuple[str, str]:
    if not subject:
        return "", ""
    import re
    cn_match = re.search(r"(?:^|,)CN=([^,]+)", subject)
    cn = (cn_match.group(1) if cn_match else subject).strip()
    doc_match = re.search(r"(\d{14}|\d{11})", cn)
    document = doc_match.group(1) if doc_match else ""
    name = cn.split(":")[0].strip()
    return name, document


def _pagination_links(path: str, total: int, page: int, page_size: int, params: dict) -> dict:
    total_pages = max(0, math.ceil(total / page_size) - 1) if page_size > 0 else 0
    q = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
    base = f"{path}?{q}&" if q else f"{path}?"
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages + 1,
        "next_url": f"{base}page={page + 1}&page_size={page_size}" if page < total_pages else None,
        "prev_url": f"{base}page={page - 1}&page_size={page_size}" if page > 0 else None,
    }


def _edition_detail_response(edition: Edition) -> EditionDetail:
    items = [_build_item_public(item) for item in sorted(edition.items or [], key=lambda i: i.position)]

    sigs = []
    for s in edition.signatures or []:
        ci = s.certificate_info or {}
        sigs.append({
            "signed_at": s.signed_at.isoformat() if s.signed_at else None,
            "certificate_subject": ci.get("subject", ""),
            "certificate_serial": ci.get("serial", ""),
            "certificate_thumbprint": ci.get("thumbprint", ""),
        })

    return EditionDetail(
        id=edition.id,
        number=edition.number,
        year=edition.year,
        type=edition.type,
        title=edition.title,
        subtitle=edition.subtitle,
        publication_date=edition.publication_date,
        verification_code=edition.verification_code,
        pdf_hash=edition.pdf_hash,
        immutability_hash=edition.immutability_hash,
        published_at=edition.published_at,
        pdf_url=_build_pdf_url(edition),
        items=items,
        signatures=sigs,
    )


@router.get(
    "/api/public/v1/organization",
    summary="Get current organization by domain",
    description="Returns public organization info based on the request domain/tenant. Returns null/default if no tenant configured.",
)
async def v1_get_organization(
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
):
    if tenant is None:
        return {
            "id": None,
            "name": "Diário Oficial Eletrônico",
            "slug": "default",
            "logo_url": None,
            "description": "Portal de Consulta Pública",
            "theme": {
                "primary_color": "#1a56db",
                "secondary_color": "#7c3aed",
                "font_family": "Inter, sans-serif",
            },
        }
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


@router.get(
    "/api/public/v1/editions",
    response_model=EditionListResponse,
    summary="List published editions",
    description="Returns paginated list of PUBLISHED editions. Ordered by year/number descending.",
)
@limiter.limit("60/minute")
async def v1_list_editions(
    request: Request,
    year: Optional[int] = Query(None, description="Filter by year"),
    type: Optional[str] = Query(None, description="Filter by type: normal, extra, suplementar"),
    search: Optional[str] = Query(None, description="Search in title and subtitle"),
    page: int = Query(0, ge=0, description="Page number (0-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Edition)
        .where(Edition.status == EditionStatus.PUBLISHED)
        .options(
            selectinload(Edition.items).selectinload(EditionItem.matter),
            selectinload(Edition.signatures),
        )
    )
    if tenant is not None:
        query = query.where(Edition.organization_id == tenant.id)
    if year:
        query = query.where(Edition.year == year)
    if type:
        query = query.where(Edition.type == type)
    if search:
        like = f"%{search}%"
        query = query.where(or_(Edition.title.ilike(like), Edition.subtitle.ilike(like)))
    query = query.order_by(Edition.year.desc(), Edition.number.desc())

    total_query = select(Edition).where(Edition.status == EditionStatus.PUBLISHED)
    if tenant is not None:
        total_query = total_query.where(Edition.organization_id == tenant.id)
    if year:
        total_query = total_query.where(Edition.year == year)
    if type:
        total_query = total_query.where(Edition.type == type)
    total_result = await db.execute(total_query)

    total_count = 0
    for _ in total_result.scalars():
        total_count += 1
    total_result.close()

    offset = page * page_size
    query = query.offset(offset).limit(page_size)
    result = await db.execute(query)
    editions = result.scalars().all()

    params = {"year": year, "type": type, "search": search}
    pagination = _pagination_links(
        f"{request.base_url}api/public/v1/editions", total_count, page, page_size, params
    )

    return EditionListResponse(
        data=[
            EditionSummary(
                id=e.id,
                number=e.number,
                year=e.year,
                type=e.type,
                title=e.title,
                subtitle=e.subtitle,
                daily_summary=_edition_daily_summary(e),
                publication_date=e.publication_date,
                verification_code=e.verification_code,
                item_count=len(e.items or []),
                signature_count=len(e.signatures or []),
                pdf_url=_build_pdf_url(e),
            )
            for e in editions
        ],
        pagination=PaginationMeta(**pagination),
    )


@router.get(
    "/api/public/v1/editions/{year}/{number}",
    response_model=EditionDetail,
    summary="Get edition details by year and number",
    description="Returns full published edition details using the public year/number URL.",
)
@limiter.limit("60/minute")
async def v1_get_edition_by_year_number(
    request: Request,
    year: int,
    number: int,
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
    db: AsyncSession = Depends(get_db),
):
    conditions = [
        Edition.year == year,
        Edition.number == number,
        Edition.status == EditionStatus.PUBLISHED,
    ]
    if tenant is not None:
        conditions.append(Edition.organization_id == tenant.id)
    result = await db.execute(
        select(Edition)
        .where(*conditions)
        .options(
            selectinload(Edition.items).selectinload(EditionItem.matter).selectinload(Matter.act_type),
            selectinload(Edition.items).selectinload(EditionItem.matter).selectinload(Matter.org_unit),
            selectinload(Edition.items).selectinload(EditionItem.matter).selectinload(Matter.author),
            selectinload(Edition.signatures),
        )
    )
    edition = result.scalar_one_or_none()
    if edition is None:
        raise HTTPException(status_code=404, detail="Edition not found")

    return _edition_detail_response(edition)


@router.get(
    "/api/public/v1/editions/by-year/{year}/{number}",
    response_model=EditionDetail,
    summary="Get edition by year and number",
    description="Returns full edition details including items and signatures, looked up by year and number.",
)
@limiter.limit("60/minute")
async def v1_get_edition_by_year_number_alt(
    request: Request,
    year: int,
    number: int,
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
    db: AsyncSession = Depends(get_db),
):
    conditions = [
        Edition.year == year,
        Edition.number == number,
        Edition.status == EditionStatus.PUBLISHED,
    ]
    if tenant is not None:
        conditions.append(Edition.organization_id == tenant.id)
    result = await db.execute(
        select(Edition)
        .where(*conditions)
        .options(
            selectinload(Edition.items).selectinload(EditionItem.matter).selectinload(Matter.act_type),
            selectinload(Edition.items).selectinload(EditionItem.matter).selectinload(Matter.org_unit),
            selectinload(Edition.items).selectinload(EditionItem.matter).selectinload(Matter.author),
            selectinload(Edition.signatures),
        )
    )
    edition = result.scalar_one_or_none()
    if edition is None:
        raise HTTPException(status_code=404, detail="Edition not found")

    items = [_build_item_public(item) for item in sorted(edition.items or [], key=lambda i: i.position)]

    sigs = []
    for s in edition.signatures or []:
        ci = s.certificate_info or {}
        sigs.append({
            "signed_at": s.signed_at.isoformat() if s.signed_at else None,
            "certificate_subject": ci.get("subject", ""),
            "certificate_serial": ci.get("serial", ""),
            "certificate_thumbprint": ci.get("thumbprint", ""),
        })

    return EditionDetail(
        id=edition.id,
        number=edition.number,
        year=edition.year,
        type=edition.type,
        title=edition.title,
        subtitle=edition.subtitle,
        publication_date=edition.publication_date,
        verification_code=edition.verification_code,
        pdf_hash=edition.pdf_hash,
        immutability_hash=edition.immutability_hash,
        published_at=edition.published_at,
        pdf_url=_build_pdf_url(edition),
        items=items,
        signatures=sigs,
    )


@router.get(
    "/api/public/v1/editions/{edition_id}",
    response_model=EditionDetail,
    summary="Get edition details",
    description="Returns full edition details including items and signatures.",
)
@limiter.limit("60/minute")
async def v1_get_edition(
    request: Request,
    edition_id: uuid.UUID,
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
    db: AsyncSession = Depends(get_db),
):
    conditions = [Edition.id == edition_id, Edition.status == EditionStatus.PUBLISHED]
    if tenant is not None:
        conditions.append(Edition.organization_id == tenant.id)
    result = await db.execute(
        select(Edition)
        .where(*conditions)
        .options(
            selectinload(Edition.items).selectinload(EditionItem.matter).selectinload(Matter.act_type),
            selectinload(Edition.items).selectinload(EditionItem.matter).selectinload(Matter.org_unit),
            selectinload(Edition.items).selectinload(EditionItem.matter).selectinload(Matter.author),
            selectinload(Edition.signatures),
        )
    )
    edition = result.scalar_one_or_none()
    if edition is None:
        raise HTTPException(status_code=404, detail="Edition not found")

    return _edition_detail_response(edition)


@router.get(
    "/api/public/v1/matters",
    response_model=MatterListResponse,
    summary="List published matters",
    description="Returns paginated list of PUBLISHED matters with search and filters.",
)
@limiter.limit("60/minute")
async def v1_list_matters(
    request: Request,
    q: Optional[str] = Query(None, description="Search in title and summary"),
    act_type: Optional[str] = Query(None, description="Filter by act type name"),
    org_unit: Optional[str] = Query(None, description="Filter by org unit abbreviation"),
    year: Optional[int] = Query(None, description="Filter by edition year"),
    date_from: Optional[date] = Query(None, description="Filter by publication date (start)"),
    date_to: Optional[date] = Query(None, description="Filter by publication date (end)"),
    edition: Optional[int] = Query(None, description="Filter by edition number"),
    page: int = Query(0, ge=0, description="Page number (0-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Matter)
        .where(Matter.status == "published")
        .options(selectinload(Matter.act_type), selectinload(Matter.org_unit))
    )
    if tenant is not None:
        query = query.where(Matter.organization_id == tenant.id)
    if q:
        like = f"%{q}%"
        query = query.where(
            or_(Matter.title.ilike(like), Matter.summary.ilike(like), Matter.plain_text.ilike(like))
        )
    if act_type:
        query = query.join(Matter.act_type).where(
            Matter.act_type.property.mapper.class_.name.ilike(f"%{act_type}%")
        )
    if org_unit:
        query = query.join(Matter.org_unit).where(
            Matter.org_unit.property.mapper.class_.abbreviation.ilike(f"%{org_unit}%")
        )
    if date_from:
        query = query.where(Matter.published_at >= date_from)
    if date_to:
        query = query.where(Matter.published_at <= datetime.combine(date_to, datetime.max.time()))
    if year or edition is not None:
        subq = select(EditionItem.matter_id).join(Edition).where(
            Edition.status == EditionStatus.PUBLISHED
        )
        if tenant is not None:
            subq = subq.where(Edition.organization_id == tenant.id)
        if year:
            subq = subq.where(Edition.year == year)
        if edition is not None:
            subq = subq.where(Edition.number == edition)
        query = query.where(Matter.id.in_(subq))

    total_result = await db.execute(query)
    total_count = 0
    for _ in total_result.scalars():
        total_count += 1
    total_result.close()

    offset = page * page_size
    query = query.offset(offset).limit(page_size).order_by(Matter.published_at.desc())
    result = await db.execute(query)
    matters = result.scalars().all()

    # Build a map of matter_id -> edition_number for the result set
    matter_ids = [m.id for m in matters]
    edition_map: dict[uuid.UUID, int] = {}
    if matter_ids:
        items_result = await db.execute(
            select(EditionItem.matter_id, Edition.number)
            .join(Edition)
            .where(
                EditionItem.matter_id.in_(matter_ids),
                Edition.status == EditionStatus.PUBLISHED,
            )
        )
        for row in items_result:
            edition_map[row[0]] = row[1]

    params = {"q": q, "act_type": act_type, "org_unit": org_unit, "year": year}
    pagination = _pagination_links(
        f"{request.base_url}api/public/v1/matters", total_count, page, page_size, params
    )

    return MatterListResponse(
        data=[
            MatterSummary(
                id=m.id,
                title=m.title,
                summary=m.summary,
                act_type=m.act_type.name if m.act_type else "",
                org_unit=m.org_unit.abbreviation if m.org_unit else "",
                edition_number=str(edition_map.get(m.id, "")) if edition_map.get(m.id) else None,
                publication_date=m.published_at.date() if m.published_at else None,
            )
            for m in matters
        ],
        pagination=PaginationMeta(**pagination),
    )


@router.get(
    "/api/public/v1/matters/{matter_id}",
    response_model=MatterDetailPublic,
    summary="Get matter details",
    description="Returns full matter content with sanitized HTML and attachments.",
)
@limiter.limit("60/minute")
async def v1_get_matter(
    request: Request,
    matter_id: uuid.UUID,
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
    db: AsyncSession = Depends(get_db),
):
    conditions = [Matter.id == matter_id, Matter.status == "published"]
    if tenant is not None:
        conditions.append(Matter.organization_id == tenant.id)
    result = await db.execute(
        select(Matter)
        .where(*conditions)
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

    attachments = [
        MatterAttachmentPublic(
            id=att.id,
            title=att.title,
            type=att.type,
            filename=att.file.filename if att.file else None,
            mime_type=att.file.mime_type if att.file else None,
            size_bytes=att.file.size_bytes if att.file else None,
            download_url=_build_attachment_url(att),
        )
        for att in (matter.attachments or [])
    ]

    return MatterDetailPublic(
        id=matter.id,
        title=matter.title,
        summary=matter.summary,
        content_html=matter.content_html,
        act_type=matter.act_type.name if matter.act_type else "",
        org_unit=matter.org_unit.abbreviation if matter.org_unit else "",
        author=matter.author.name if matter.author else "",
        published_at=matter.published_at,
        attachments=attachments,
    )


@router.get(
    "/api/public/v1/verify/{code}",
    response_model=VerifyResult,
    summary="Verify document authenticity",
    description="Validates a verification code against a published edition. "
    "Returns document details and signature certificate info.",
)
@limiter.limit("30/minute")
async def v1_verify(
    request: Request,
    code: str,
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
    db: AsyncSession = Depends(get_db),
):
    conditions = [Edition.verification_code == code]
    if tenant is not None:
        conditions.append(Edition.organization_id == tenant.id)
    result = await db.execute(
        select(Edition)
        .where(*conditions)
        .options(selectinload(Edition.signatures))
    )
    edition = result.scalar_one_or_none()
    if edition is None or edition.status != EditionStatus.PUBLISHED:
        return VerifyResult(
            valid=False,
            message="Verification code not found or document not published",
        )

    sig = edition.signatures[0] if edition.signatures else None
    ci = sig.certificate_info if sig else {}
    certificate_name, certificate_document = _certificate_identity(ci.get("subject", ""))

    return VerifyResult(
        valid=True,
        edition_id=edition.id,
        edition_title=edition.title,
        edition_number=edition.number,
        edition_year=edition.year,
        publication_date=edition.publication_date,
        pdf_hash=edition.pdf_hash,
        immutability_hash=edition.immutability_hash,
        certificate_subject=ci.get("subject", ""),
        certificate_name=certificate_name,
        certificate_document=certificate_document,
        signed_at=sig.signed_at if sig else None,
        verification_url=f"{PUBLIC_URL}/verificar/{code}",
        message="Document verified successfully",
    )
