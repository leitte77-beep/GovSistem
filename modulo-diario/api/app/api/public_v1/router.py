"""Public API v1 — versioned, rate-limited, documented, only published data."""

import math
import re
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import String, and_, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only, noload, selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.tenant import require_tenant, resolve_tenant_from_domain
from app.models.act_type import ActType
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

limiter = Limiter(key_func=get_remote_address)

PUBLIC_URL = settings.PUBLIC_URL or "http://localhost:7200"


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


# Filtro por espécie de ato no portal. O acervo legado entra como uma matéria
# "Outros" por edição, com o sumário do PDF ("PORTARIAS; PORTARIA Nº ...") no
# summary: por isso casa pelo tipo cadastrado OU pelo título/sumário. O texto
# integral fica de fora (todo cabeçalho antigo cita "Lei nº 751/2015").
ACT_FILTERS: dict[str, tuple[str, tuple[str, ...], str]] = {
    "lei": ("Leis", ("Lei",), r"\mLEIS?\M"),
    "decreto": ("Decretos", ("Decreto",), r"\mDECRETOS?\M"),
    "portaria": ("Portarias", ("Portaria",), r"\mPORTARIAS?\M"),
    "resolucao": ("Resoluções", (), r"\mRESOLU[CÇ](AO|ÃO|OES|ÕES)\M"),
    "edital": ("Editais", ("Edital",), r"\mEDITA(L|IS)\M"),
    "licitacao": (
        "Licitações e compras", ("Licitação", "Processos de Compra"),
        r"LICITA|PREG[AÃ]O|TOMADA DE PRE[CÇ]O|DISPENSA|INEXIGIBILIDADE|CHAMAMENTO|PROCESSOS? DE COMPRA",
    ),
    "contrato": ("Contratos e aditivos", ("Contrato",), r"\mCONTRATOS?\M|ADITIVO"),
    "ata": ("Atas", ("Ata",), r"\mATAS?\M"),
    "relatorio": (
        "Relatórios contábeis", ("Relatório Contábil",),
        r"RELAT[OÓ]RIO|BALAN[CÇ]|\mRREO\M|\mRGF\M|AUDI[EÊ]NCIA P[UÚ]BLICA",
    ),
}


def _act_filter_clause(key: str):
    """Edição que contém ao menos uma matéria da espécie pedida."""
    _, type_names, pattern = ACT_FILTERS[key]
    text = func.upper(func.concat(Matter.title, " ", func.coalesce(Matter.summary, "")))
    conds = [text.op("~")(pattern)]
    if type_names:
        conds.append(Matter.act_type_id.in_(select(ActType.id).where(ActType.name.in_(type_names))))
    return (
        select(EditionItem.id)
        .join(Matter, Matter.id == EditionItem.matter_id)
        .where(EditionItem.edition_id == Edition.id, or_(*conds))
        .exists()
    )


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
@limiter.limit("60/minute")
async def v1_get_organization(
    request: Request,
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
        # Contato institucional (cadastrado em Configurações > Instituição),
        # usado na página "Contato" do portal.
        "contact": {
            "email": tenant.email,
            "phone": tenant.phone,
            "site": tenant.site,
            "address_street": tenant.address_street,
            "address_number": tenant.address_number,
            "address_complement": tenant.address_complement,
            "address_district": tenant.address_district,
            "address_city": tenant.address_city,
            "state": tenant.state,
            "address_postal_code": tenant.address_postal_code,
        },
        "theme": {
            "primary_color": theme.get("primary_color", "#1a56db"),
            "secondary_color": theme.get("secondary_color", "#7c3aed"),
            "font_family": theme.get("font_family", "Inter, sans-serif"),
        },
    }



def _edition_search_clause(search: str, accent_insensitive: bool = False):
    """Busca de edições: além do título/subtítulo da edição (que quase sempre
    é só "Edição nº X"), procura no conteúdo das matérias publicadas nela —
    é ali que estão nomes, números de portaria, objetos de licitação etc.

    Cada palavra precisa aparecer (em qualquer campo), então "portaria 251"
    acha "Portaria Nº 251/2026". No PostgreSQL ignora acentos via unaccent.
    """
    def norm(expr):
        return func.unaccent(expr) if accent_insensitive else expr

    def term_clause(term: str):
        like = norm(f"%{term}%")
        matter_hit = (
            select(EditionItem.id)
            .join(Matter, Matter.id == EditionItem.matter_id)
            .where(
                EditionItem.edition_id == Edition.id,
                or_(
                    norm(Matter.title).ilike(like),
                    norm(Matter.summary).ilike(like),
                    norm(Matter.plain_text).ilike(like),
                    Matter.act_number.ilike(f"%{term}%"),
                ),
            )
            .exists()
        )
        return or_(norm(Edition.title).ilike(like), norm(Edition.subtitle).ilike(like), matter_hit)

    terms = search.split() or [search]
    return and_(*[term_clause(t) for t in terms])


@router.get(
    "/api/public/v1/editions/years",
    summary="Anos com edições publicadas",
    description="Anos (mais recente primeiro) com a quantidade de edições publicadas; alimenta o filtro do portal.",
)
@limiter.limit("60/minute")
async def v1_edition_years(
    request: Request,
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
    db: AsyncSession = Depends(get_db),
):
    if tenant is None:
        return []
    rows = await db.execute(
        select(Edition.year, func.count(Edition.id))
        .where(Edition.status == EditionStatus.PUBLISHED, Edition.organization_id == tenant.id)
        .group_by(Edition.year)
        .order_by(Edition.year.desc())
    )
    return [{"year": y, "count": c} for y, c in rows.all()]


@router.get(
    "/api/public/v1/editions/act-filters",
    summary="Espécies de ato para filtrar edições",
    description="Espécies de ato com a quantidade de edições publicadas que contêm cada uma.",
)
@limiter.limit("60/minute")
async def v1_edition_act_filters(
    request: Request,
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
    db: AsyncSession = Depends(get_db),
):
    if tenant is None:
        return []
    out = []
    for key, (label, _, _) in ACT_FILTERS.items():
        count = (await db.execute(
            select(func.count(Edition.id)).where(
                Edition.status == EditionStatus.PUBLISHED,
                Edition.organization_id == tenant.id,
                _act_filter_clause(key),
            )
        )).scalar_one()
        out.append({"key": key, "label": label, "count": count})
    return out


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
    month: Optional[int] = Query(None, ge=1, le=12, description="Mês da publicação"),
    date_from: Optional[date] = Query(None, description="Publicadas a partir de (inclusive)"),
    date_to: Optional[date] = Query(None, description="Publicadas até (inclusive)"),
    number: Optional[int] = Query(None, ge=0, description="Número da edição"),
    act: Optional[str] = Query(None, description="Espécie de ato (ver /editions/act-filters)"),
    order: str = Query("desc", pattern="^(asc|desc)$", description="desc = mais recentes primeiro"),
    page: int = Query(0, ge=0, description="Page number (0-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
    db: AsyncSession = Depends(get_db),
):
    params = {
        "year": year, "type": type, "search": search, "month": month,
        "date_from": date_from, "date_to": date_to, "number": number, "act": act,
        "order": order if order != "desc" else None,
    }
    if tenant is None:
        pagination = _pagination_links(
            f"{request.base_url}api/public/v1/editions", 0, page, page_size, params
        )
        return EditionListResponse(data=[], pagination=PaginationMeta(**pagination))

    query = (
        select(Edition)
        .where(Edition.status == EditionStatus.PUBLISHED)
        .options(
            # A listagem só usa título/súmula das matérias: carregar o texto
            # completo de cada uma deixava a página inicial lenta (~0,8 s).
            # Nem as relações automáticas da matéria (versões, revisões,
            # anexos): as versões guardam cópias do conteúdo e eram a maior
            # parte do tempo.
            selectinload(Edition.items)
            .selectinload(EditionItem.matter)
            .options(load_only(Matter.id, Matter.title, Matter.summary), noload("*")),
            selectinload(Edition.signatures),
        )
    )
    filters = [
        Edition.status == EditionStatus.PUBLISHED,
        Edition.organization_id == tenant.id,
    ]
    if year:
        filters.append(Edition.year == year)
    if type:
        filters.append(Edition.type == type)
    if search:
        filters.append(_edition_search_clause(search, _dialect_is_postgres(db)))
    if month:
        filters.append(func.extract("month", Edition.publication_date) == month)
    if date_from:
        filters.append(Edition.publication_date >= date_from)
    if date_to:
        filters.append(Edition.publication_date <= date_to)
    if number is not None:
        filters.append(Edition.number == number)
    if act:
        if act not in ACT_FILTERS:
            raise HTTPException(status_code=422, detail="Espécie de ato desconhecida")
        filters.append(_act_filter_clause(act))
    query = query.where(*filters)
    # Ordena pela data de publicação (a edição mais recente/publicada fica na
    # frente), com desempate pela hora de publicação e, por fim, número. É o que
    # garante que uma edição EXTRA publicada depois da última normal apareça
    # à frente dela (não no fim por ter número menor).
    if order == "asc":
        query = query.order_by(
            Edition.publication_date.asc().nullslast(),
            Edition.published_at.asc().nullslast(),
            Edition.year.asc(),
            Edition.number.asc(),
        )
    else:
        query = query.order_by(
            Edition.publication_date.desc().nullslast(),
            Edition.published_at.desc().nullslast(),
            Edition.year.desc(),
            Edition.number.desc(),
        )

    # Contagem no banco (antes carregava todas as edições só para contar).
    total_query = select(func.count(Edition.id)).where(*filters)
    total_count = (await db.execute(total_query)).scalar_one()

    offset = page * page_size
    query = query.offset(offset).limit(page_size)
    result = await db.execute(query)
    editions = result.scalars().all()

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
    type: Optional[str] = Query(None, description="Edition type: normal, extra, suplementar"),
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
    db: AsyncSession = Depends(get_db),
):
    if tenant is None:
        raise HTTPException(status_code=404, detail="Edition not found")
    conditions = [
        Edition.year == year,
        Edition.number == number,
        Edition.status == EditionStatus.PUBLISHED,
        Edition.organization_id == tenant.id,
    ]
    if type:
        conditions.append(Edition.type == type)
    result = await db.execute(
        select(Edition)
        .where(*conditions)
        .order_by(Edition.created_at.desc())
        .options(
            selectinload(Edition.items).selectinload(EditionItem.matter).selectinload(Matter.act_type),
            selectinload(Edition.items).selectinload(EditionItem.matter).selectinload(Matter.org_unit),
            selectinload(Edition.items).selectinload(EditionItem.matter).selectinload(Matter.author),
            selectinload(Edition.signatures),
        )
    )
    # Números são únicos por (org, ano, tipo); sem `type` pode haver colisão
    # (ex.: normal e extra com o mesmo número). `.first()` evita MultipleResultsFound
    # e, com `type`, a consulta é sempre única.
    edition = result.scalars().first()
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
    type: Optional[str] = Query(None, description="Edition type: normal, extra, suplementar"),
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
    db: AsyncSession = Depends(get_db),
):
    if tenant is None:
        raise HTTPException(status_code=404, detail="Edition not found")
    conditions = [
        Edition.year == year,
        Edition.number == number,
        Edition.status == EditionStatus.PUBLISHED,
        Edition.organization_id == tenant.id,
    ]
    if type:
        conditions.append(Edition.type == type)
    result = await db.execute(
        select(Edition)
        .where(*conditions)
        .order_by(Edition.created_at.desc())
        .options(
            selectinload(Edition.items).selectinload(EditionItem.matter).selectinload(Matter.act_type),
            selectinload(Edition.items).selectinload(EditionItem.matter).selectinload(Matter.org_unit),
            selectinload(Edition.items).selectinload(EditionItem.matter).selectinload(Matter.author),
            selectinload(Edition.signatures),
        )
    )
    edition = result.scalars().first()
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
    if tenant is None:
        raise HTTPException(status_code=404, detail="Edition not found")
    conditions = [Edition.id == edition_id, Edition.status == EditionStatus.PUBLISHED, Edition.organization_id == tenant.id]
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


def _dialect_is_postgres(db) -> bool:
    try:
        return db.bind is not None and db.bind.dialect.name == "postgresql"
    except Exception:  # noqa: BLE001 - mocked/odd sessions fall back to ILIKE
        return False


async def _fts_search_response(
    request: Request, tenant, db, *, q, date_from, date_to, org_unit, act_type, page, page_size,
):
    """Ranked PostgreSQL FTS path. Returns None when FTS is unavailable."""
    try:
        from app.services.matter_slug import matter_slug
        from app.services.search_indexer import get_search_provider

        results, total = await get_search_provider().search(
            query=q, db=db, date_from=date_from, date_to=date_to,
            org_unit=org_unit, act_type=act_type,
            organization_id=tenant.id, page=page, page_size=page_size,
        )
    except Exception:  # noqa: BLE001 - never break search: fall back to ILIKE
        return None

    ids: list[uuid.UUID] = []
    for r in results:
        try:
            ids.append(uuid.UUID(r.matter_id))
        except (ValueError, TypeError):
            continue

    matters_by_id: dict[uuid.UUID, Matter] = {}
    if ids:
        rows = (await db.execute(
            select(Matter)
            .where(Matter.id.in_(ids))
            .options(selectinload(Matter.act_type), selectinload(Matter.org_unit))
        )).scalars().all()
        matters_by_id = {m.id: m for m in rows}
    ordered = [matters_by_id[i] for i in ids if i in matters_by_id]

    edition_map: dict[uuid.UUID, int] = {}
    if ids:
        items_result = await db.execute(
            select(EditionItem.matter_id, Edition.number)
            .join(Edition)
            .where(
                EditionItem.matter_id.in_(ids),
                Edition.status == EditionStatus.PUBLISHED,
            )
        )
        for row in items_result:
            edition_map[row[0]] = row[1]

    params = {"q": q, "act_type": act_type, "org_unit": org_unit, "year": None}
    pagination = _pagination_links(
        f"{request.base_url}api/public/v1/matters", int(total), page, page_size, params
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
                slug=matter_slug(m, m.act_type),
            )
            for m in ordered
        ],
        pagination=PaginationMeta(**pagination),
    )


@router.get(
    "/api/public/v1/matters",
    response_model=MatterListResponse,
    summary="List published matters",
    description="Returns paginated list of PUBLISHED matters with search and filters.",
)
@limiter.limit("30/minute")
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
    if tenant is None:
        params = {"q": q, "act_type": act_type, "org_unit": org_unit, "year": year}
        pagination = _pagination_links(
            f"{request.base_url}api/public/v1/matters", 0, page, page_size, params
        )
        return MatterListResponse(data=[], pagination=PaginationMeta(**pagination))

    # Ranked full-text search on PostgreSQL; ILIKE elsewhere (tests/SQLite).
    if q and year is None and edition is None and _dialect_is_postgres(db):
        fts_response = await _fts_search_response(
            request, tenant, db, q=q, date_from=date_from, date_to=date_to,
            org_unit=org_unit, act_type=act_type, page=page, page_size=page_size,
        )
        if fts_response is not None:
            return fts_response

    query = (
        select(Matter)
        .where(Matter.status == "published", Matter.organization_id == tenant.id)
        .options(selectinload(Matter.act_type), selectinload(Matter.org_unit))
    )
    if q:
        like = f"%{q}%"
        # Search the visible content plus act identification and the per-act
        # dynamic fields (processo, licitação, contrato, empresa, CNPJ, ...).
        query = query.where(
            or_(
                Matter.title.ilike(like),
                Matter.summary.ilike(like),
                Matter.plain_text.ilike(like),
                Matter.act_number.ilike(like),
                cast(Matter.act_year, String).ilike(like),
                cast(Matter.metadata_json, String).ilike(like),
            )
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
            Edition.status == EditionStatus.PUBLISHED,
            Edition.organization_id == tenant.id,
        )
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

    from app.services.matter_slug import matter_slug

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
                slug=matter_slug(m, m.act_type),
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
    matter_id: str,
    tenant: Organization | None = Depends(resolve_tenant_from_domain),
    db: AsyncSession = Depends(get_db),
):
    """Look up a matter by UUID **or** by its human-readable slug."""
    from app.services.matter_slug import matter_slug, parse_slug

    if tenant is None:
        raise HTTPException(status_code=404, detail="Matter not found")

    base_conditions = [Matter.status == "published", Matter.organization_id == tenant.id]
    options = (
        selectinload(Matter.act_type),
        selectinload(Matter.org_unit),
        selectinload(Matter.author),
        selectinload(Matter.attachments).selectinload(MatterAttachment.file),
    )

    matter = None
    try:
        matter = (await db.execute(
            select(Matter)
            .where(*base_conditions, Matter.id == uuid.UUID(matter_id))
            .options(*options)
        )).scalar_one_or_none()
    except (ValueError, AttributeError):
        # Stored slug is the canonical lookup (no scan needed).
        matter = (await db.execute(
            select(Matter)
            .where(*base_conditions, Matter.slug == matter_id)
            .options(*options)
        )).scalar_one_or_none()
        if matter is None:
            # Legacy fallback: derive (type-number-year) and match computed slug.
            parsed = parse_slug(matter_id)
            if parsed is None:
                raise HTTPException(status_code=404, detail="Matter not found")
            _type_token, number, year = parsed
            slug_query = select(Matter).where(
                *base_conditions, Matter.act_number == str(number)
            ).options(*options)
            if year:
                slug_query = slug_query.where(Matter.act_year == year)
            candidates = (await db.execute(slug_query)).scalars().all()
            matter = next(
                (m for m in candidates if matter_slug(m, m.act_type) == matter_id), None
            )

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

    # Parent published edition + signature, so the public matter page can show
    # the edition link and the digital-signature block in one request.
    edition_info = None
    signature_info = None
    try:
        item_row = (await db.execute(
            select(EditionItem, Edition)
            .join(Edition, Edition.id == EditionItem.edition_id)
            .where(
                EditionItem.matter_id == matter.id,
                Edition.status == EditionStatus.PUBLISHED,
            )
            .options(selectinload(Edition.signatures))
            .order_by(Edition.published_at.desc())
        )).first()
    except Exception:  # noqa: BLE001 - edition context is best-effort
        item_row = None
    if item_row is not None and hasattr(item_row, "__len__") and len(item_row) == 2:
        _item, edition = item_row
        edition_info = {
            "id": str(edition.id),
            "number": edition.number,
            "year": edition.year,
            "publication_date": (
                edition.publication_date.isoformat() if edition.publication_date else None
            ),
            "verification_code": edition.verification_code or "",
        }
        sig = edition.signatures[0] if edition.signatures else None
        if sig is not None:
            ci = sig.certificate_info or {}
            signature_info = {
                "signed_at": sig.signed_at.isoformat() if sig.signed_at else None,
                "subject": ci.get("subject", ""),
                "serial": ci.get("serial", ""),
                "validation_status": ci.get("validation_status", ""),
            }

    # Living relations layer: lets the public matter page show "retificada por"
    # / "retifica" with a canonical link. Best-effort — never breaks the page.
    relations_out: list[dict] = []
    try:
        from app.services.matter_relations import list_relations_batch, relation_public

        grouped = (await list_relations_batch(db, tenant.id, [matter.id])).get(
            str(matter.id), {}
        )
        for direction, rels in (
            ("outgoing", grouped.get("outgoing", [])),
            ("incoming", grouped.get("incoming", [])),
        ):
            for rel in rels:
                public = relation_public(rel)
                public["direction"] = direction
                relations_out.append(public)
    except Exception:  # noqa: BLE001 - relations are an enrichment, not core
        relations_out = []

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
        slug=matter_slug(matter, matter.act_type),
        edition=edition_info,
        signature=signature_info,
        relations=relations_out,
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
    if tenant is None:
        return VerifyResult(
            valid=False,
            message="Verification code not found or document not published",
        )
    conditions = [Edition.verification_code == code, Edition.organization_id == tenant.id]
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


# ── Boletim por e-mail ───────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")


def _as_utc(value: datetime) -> datetime:
    # PostgreSQL devolve com fuso; SQLite (testes) devolve sem.
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


class NewsletterSubscribeIn(BaseModel):
    email: str


class NewsletterTokenIn(BaseModel):
    token: str


@router.post("/api/public/v1/newsletter/subscribe", summary="Inscrever e-mail no boletim")
@limiter.limit("5/minute")
async def v1_newsletter_subscribe(
    request: Request,
    body: NewsletterSubscribeIn,
    background: BackgroundTasks,
    tenant: Organization = Depends(require_tenant),
    db: AsyncSession = Depends(get_db),
):
    from app.models.newsletter import NewsletterSubscriber
    from app.services import newsletter

    if not newsletter.is_enabled():
        raise HTTPException(503, "Boletim temporariamente indisponível.")
    email = body.email.strip().lower()
    if len(email) > 255 or not _EMAIL_RE.match(email):
        raise HTTPException(422, "Informe um e-mail válido.")

    sub = (
        await db.execute(
            select(NewsletterSubscriber).where(
                NewsletterSubscriber.organization_id == tenant.id,
                NewsletterSubscriber.email == email,
            )
        )
    ).scalar_one_or_none()

    # A resposta é a mesma em todos os casos, para não revelar quem já é inscrito.
    message = "Enviamos um link de confirmação para o seu e-mail."
    if sub is not None and sub.status == "confirmed":
        return {"status": "ok", "message": message}

    now = datetime.now(timezone.utc)
    if sub is None:
        sub = NewsletterSubscriber(organization_id=tenant.id, email=email, token=newsletter.new_token())
        db.add(sub)
    elif sub.confirmation_sent_at and (
        now - _as_utc(sub.confirmation_sent_at)
    ).total_seconds() < 600:
        # Evita usar o formulário para bombardear a caixa de alguém.
        return {"status": "ok", "message": message}
    sub.status = "pending"
    sub.unsubscribed_at = None
    sub.consent_ip = get_remote_address(request)
    await db.commit()
    background.add_task(newsletter.send_confirmation, sub.id)
    return {"status": "ok", "message": message}


async def _subscriber_by_token(db: AsyncSession, tenant: Organization, token: str):
    from app.models.newsletter import NewsletterSubscriber

    sub = (
        await db.execute(
            select(NewsletterSubscriber).where(
                NewsletterSubscriber.token == token,
                NewsletterSubscriber.organization_id == tenant.id,
            )
        )
    ).scalar_one_or_none()
    if sub is None:
        raise HTTPException(404, "Link inválido ou expirado.")
    return sub


@router.post("/api/public/v1/newsletter/confirm", summary="Confirmar inscrição no boletim")
@limiter.limit("20/minute")
async def v1_newsletter_confirm(
    request: Request,
    body: NewsletterTokenIn,
    tenant: Organization = Depends(require_tenant),
    db: AsyncSession = Depends(get_db),
):
    sub = await _subscriber_by_token(db, tenant, body.token)
    if sub.status != "confirmed":
        sub.status = "confirmed"
        sub.confirmed_at = datetime.now(timezone.utc)
        sub.unsubscribed_at = None
        await db.commit()
    return {"status": "confirmed", "email": sub.email}


@router.post("/api/public/v1/newsletter/unsubscribe", summary="Cancelar inscrição no boletim")
@limiter.limit("20/minute")
async def v1_newsletter_unsubscribe(
    request: Request,
    body: NewsletterTokenIn,
    tenant: Organization = Depends(require_tenant),
    db: AsyncSession = Depends(get_db),
):
    sub = await _subscriber_by_token(db, tenant, body.token)
    if sub.status != "unsubscribed":
        sub.status = "unsubscribed"
        sub.unsubscribed_at = datetime.now(timezone.utc)
        await db.commit()
    return {"status": "unsubscribed", "email": sub.email}


# ── Contadores de acesso ─────────────────────────────────────────────────────
# O navegador chama o POST uma vez por sessão (controle no portal); robôs e
# pré-visualizações de link (WhatsApp, Facebook...) não incrementam.

_BOT_UA = re.compile(
    r"bot|crawl|spider|slurp|headless|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python-requests",
    re.IGNORECASE,
)


def _is_bot(request: Request) -> bool:
    ua = request.headers.get("user-agent", "")
    return not ua or bool(_BOT_UA.search(ua))


async def _bump(db: AsyncSession, model, key: dict, extra: dict | None = None) -> int:
    """Incremento atômico (INSERT ... ON CONFLICT DO UPDATE ... RETURNING)."""
    if _dialect_is_postgres(db):
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    stmt = insert(model).values(**key, **(extra or {}), total=1)
    stmt = stmt.on_conflict_do_update(
        index_elements=list(key),
        set_={"total": model.total + 1, "updated_at": func.now()},
    ).returning(model.total)
    total = (await db.execute(stmt)).scalar_one()
    await db.commit()
    return int(total)


async def _published_edition(db: AsyncSession, tenant: Organization, edition_id: uuid.UUID) -> Edition:
    edition = (
        await db.execute(
            select(Edition).where(
                Edition.id == edition_id,
                Edition.organization_id == tenant.id,
                Edition.status == EditionStatus.PUBLISHED,
            )
        )
    ).scalar_one_or_none()
    if edition is None:
        raise HTTPException(404, "Edição não encontrada")
    return edition


@router.get("/api/public/v1/stats", summary="Total de visitas ao portal")
@limiter.limit("120/minute")
async def v1_stats(
    request: Request,
    tenant: Organization = Depends(require_tenant),
    db: AsyncSession = Depends(get_db),
):
    from app.models.view_counter import PortalVisitCounter

    row = await db.get(PortalVisitCounter, tenant.id)
    return {"visits": int(row.total) if row else 0}


@router.post("/api/public/v1/stats/visit", summary="Registrar visita ao portal")
@limiter.limit("30/minute")
async def v1_stats_visit(
    request: Request,
    tenant: Organization = Depends(require_tenant),
    db: AsyncSession = Depends(get_db),
):
    from app.models.view_counter import PortalVisitCounter

    if _is_bot(request):
        row = await db.get(PortalVisitCounter, tenant.id)
        return {"visits": int(row.total) if row else 0}
    return {"visits": await _bump(db, PortalVisitCounter, {"organization_id": tenant.id})}


@router.get("/api/public/v1/edition-views/{edition_id}", summary="Acessos à edição")
@limiter.limit("120/minute")
async def v1_edition_views(
    request: Request,
    edition_id: uuid.UUID,
    tenant: Organization = Depends(require_tenant),
    db: AsyncSession = Depends(get_db),
):
    from app.models.view_counter import EditionViewCounter

    await _published_edition(db, tenant, edition_id)
    row = await db.get(EditionViewCounter, edition_id)
    return {"views": int(row.total) if row else 0}


@router.post("/api/public/v1/edition-views/{edition_id}", summary="Registrar acesso à edição")
@limiter.limit("60/minute")
async def v1_edition_view(
    request: Request,
    edition_id: uuid.UUID,
    tenant: Organization = Depends(require_tenant),
    db: AsyncSession = Depends(get_db),
):
    from app.models.view_counter import EditionViewCounter

    await _published_edition(db, tenant, edition_id)
    if _is_bot(request):
        row = await db.get(EditionViewCounter, edition_id)
        return {"views": int(row.total) if row else 0}
    views = await _bump(db, EditionViewCounter, {"edition_id": edition_id}, {"organization_id": tenant.id})
    return {"views": views}
