import hashlib
import hmac
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_roles
from app.core.config import settings
from app.core.config import settings as api_settings
from app.core.database import get_db
from app.middleware.audit import capture_request_info, log_audit_event
from app.models.edition import Edition
from app.models.edition_item import EditionItem
from app.models.enums import AuditAction, EditionStatus, EditionType, MatterStatus
from app.models.matter import Matter
from app.models.signature import Signature
from app.models.signature_operation_audit import SignatureOperationAudit
from app.models.signing_credential import SigningCredential
from app.models.user import User
from app.schemas.edition import (
    AddItemRequest,
    EditionCreate,
    EditionItemOut,
    EditionListResponse,
    EditionResponse,
    EditionUpdate,
    NextEditionNumberResponse,
    PublishResponse,
    ReorderRequest,
    SignRequest,
    SignResponse,
    ValidateSignatureResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["editions"])


def no_hard_errors(errors: list[str]) -> bool:
    """False if any validation error indicates a real integrity failure."""
    hard = [e for e in (errors or []) if not e.startswith("Certificate issuer")]
    return len(hard) == 0


async def _record_signature_operation(
    db: AsyncSession,
    operation_id: str,
    organization_id: uuid.UUID | None,
    edition_id: uuid.UUID | None,
    credential_id: uuid.UUID | None,
    provider: str | None,
    requested_by: uuid.UUID | None,
    started_at: datetime,
    finished_at: datetime | None,
    result: str | None,
    source_hash: str | None,
    signed_hash: str | None,
    certificate_serial: str | None,
    correlation_id: str | None,
    client_service: str | None,
    error: str | None = None,
) -> None:
    """Persist a signing operation audit entry. Never stores secrets."""
    op = SignatureOperationAudit(
        operation_id=operation_id,
        organization_id=organization_id,
        edition_id=edition_id,
        credential_id=credential_id,
        provider=provider,
        requested_by=requested_by,
        requested_at=started_at,
        started_at=started_at,
        finished_at=finished_at,
        result=result,
        source_hash=source_hash,
        signed_hash=signed_hash,
        certificate_serial=certificate_serial,
        correlation_id=correlation_id,
        client_service=client_service,
        error=error,
    )
    db.add(op)
    await db.flush()


def _status_value(status) -> str:
    return status.value if hasattr(status, "value") else str(status)


async def _auto_numbering_enabled(db: AsyncSession) -> bool:
    """Read the 'edition.auto_numbering' system setting (defaults to True)."""
    from app.models.setting import SystemSetting

    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == "edition.auto_numbering")
    )
    setting = result.scalar_one_or_none()
    if setting is None or setting.value is None:
        return True
    return str(setting.value).strip().lower() in ("true", "1", "yes", "on")


async def _next_edition_number(
    db: AsyncSession, organization_id: uuid.UUID, year: int, type_: EditionType
) -> int:
    result = await db.execute(
        select(func.coalesce(func.max(Edition.number), 0)).where(
            Edition.organization_id == organization_id,
            Edition.year == year,
            Edition.type == type_,
        )
    )
    return int(result.scalar() or 0) + 1


def _default_edition_title(number: int) -> str:
    return f"Diário Oficial - Edição {number:02d}"


async def _get_edition_or_404(
    edition_id: uuid.UUID, db: AsyncSession
) -> Edition:
    result = await db.execute(
        select(Edition)
        .where(Edition.id == edition_id)
        .options(
            selectinload(Edition.items).selectinload(EditionItem.matter),
            selectinload(Edition.items)
            .selectinload(EditionItem.matter)
            .selectinload(Matter.act_type),
            selectinload(Edition.items)
            .selectinload(EditionItem.matter)
            .selectinload(Matter.org_unit),
            selectinload(Edition.signatures),
        )
    )
    edition = result.scalar_one_or_none()
    if edition is None:
        raise HTTPException(status_code=404, detail="Edition not found")
    return edition


async def _edition_to_response(edition: Edition) -> EditionResponse:
    items = []
    for item in edition.items or []:
        items.append(EditionItemOut(
            id=item.id,
            matter_id=item.matter_id,
            matter_title=item.matter.title if item.matter else "",
            section_title=item.section_title,
            position=item.position,
            page_number=item.page_number,
        ))
    return EditionResponse(
        id=edition.id,
        number=edition.number,
        year=edition.year,
        type=edition.type,
        title=edition.title,
        subtitle=edition.subtitle,
        publication_date=edition.publication_date,
        status=edition.status,
        created_by=edition.created_by,
        published_at=edition.published_at,
        created_at=edition.created_at,
        updated_at=edition.updated_at,
        items=items,
        item_count=len(items),
    )


# ── CRUD ─────────────────────────────────────────────────────────────────────


@router.post("/editions", response_model=EditionResponse, status_code=201)
async def create_edition(
    body: EditionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("DIAGRAMADOR", "ADMIN")),
):
    auto_numbering = await _auto_numbering_enabled(db)

    if body.number is None and not auto_numbering:
        raise HTTPException(
            status_code=422,
            detail="Edition number is required when auto numbering is disabled",
        )

    server_assigned = auto_numbering or body.number is None
    if server_assigned:
        from app.services.edition_number import edition_number_service

        number = await edition_number_service.allocate(
            db, user.organization_id, body.year, body.type
        )
    else:
        number = body.number
        existing = await db.execute(
            select(Edition).where(
                Edition.organization_id == user.organization_id,
                Edition.year == body.year,
                Edition.number == number,
                Edition.type == body.type,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail=f"Edition {number}/{body.year} ({body.type.value}) already exists",
            )

    def _resolve_title(final_number: int) -> str:
        title = (body.title or "").strip()
        if not title:
            return _default_edition_title(final_number)
        if (
            server_assigned
            and body.number is not None
            and final_number != body.number
            and re.fullmatch(rf"Diário Oficial - Edição 0*{body.number}", title)
        ):
            return _default_edition_title(final_number)
        return title

    edition = None
    max_attempts = 3
    for attempt in range(max_attempts):
        edition = Edition(
            organization_id=user.organization_id,
            number=number,
            year=body.year,
            type=body.type,
            title=_resolve_title(number),
            subtitle=body.subtitle.strip() if body.subtitle else None,
            publication_date=body.publication_date,
            status=EditionStatus.DRAFT,
            created_by=user.id,
        )
        db.add(edition)
        try:
            await db.commit()
            break
        except IntegrityError:
            await db.rollback()
            if not server_assigned or attempt == max_attempts - 1:
                raise HTTPException(
                    status_code=409,
                    detail=f"Edition {number}/{body.year} ({body.type.value}) already exists",
                )
            number = await _next_edition_number(
                db, user.organization_id, body.year, body.type
            )
    await db.refresh(edition)

    info = await capture_request_info(request)
    await log_audit_event(
        db=db, action=AuditAction.EDITION_CREATED,
        user_id=user.id, organization_id=user.organization_id,
        entity_type="edition", entity_id=edition.id,
        description=f"Edition {edition.year}/{edition.number} created",
        ip_address=info["ip_address"],
    )
    return await _edition_to_response(edition)


@router.get("/editions/open", response_model=list[dict])
async def list_open_editions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Editions currently accepting new matters (draft/reviewing/scheduled).

    Used by the matter wizard to let the author pick where the matter will
    be published instead of guessing a destination.
    """
    query = (
        select(Edition)
        .where(
            Edition.organization_id == user.organization_id,
            Edition.status.in_([EditionStatus.DRAFT, EditionStatus.REVIEWING, EditionStatus.SCHEDULED]),
        )
        .options(selectinload(Edition.items))
        .order_by(Edition.year.desc(), Edition.number.desc())
        .limit(50)
    )
    result = await db.execute(query)
    editions = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "number": e.number,
            "year": e.year,
            "title": e.title,
            "publication_date": e.publication_date.isoformat(),
            "status": _status_value(e.status),
            "item_count": len(e.items or []),
        }
        for e in editions
    ]


@router.get("/editions/next-number", response_model=NextEditionNumberResponse)
async def get_next_edition_number(
    year: Optional[int] = None,
    type: EditionType = EditionType.NORMAL,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    target_year = year or datetime.now(timezone.utc).year
    next_number = await _next_edition_number(
        db, user.organization_id, target_year, type
    )
    return NextEditionNumberResponse(
        year=target_year,
        type=type,
        next_number=next_number,
        auto_numbering=await _auto_numbering_enabled(db),
    )


@router.get("/editions", response_model=list[EditionListResponse])
async def list_editions(
    year: Optional[int] = None,
    status: Optional[str] = None,
    type: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Edition).options(selectinload(Edition.items), selectinload(Edition.signatures))
    query = query.where(Edition.organization_id == user.organization_id)
    if year:
        query = query.where(Edition.year == year)
    if status:
        query = query.where(Edition.status == EditionStatus(status))
    if type:
        query = query.where(Edition.type == EditionType(type))
    query = query.order_by(Edition.year.desc(), Edition.number.desc())
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    editions = result.scalars().all()
    return [
        EditionListResponse(
            id=e.id, number=e.number, year=e.year, type=e.type,
            title=e.title, status=e.status, publication_date=e.publication_date,
            published_at=e.published_at, created_at=e.created_at,
            item_count=len(e.items or []),
            signature_count=len(e.signatures or []),
        )
        for e in editions
    ]


@router.get("/editions/{edition_id}", response_model=EditionResponse)
async def get_edition(
    edition_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    edition = await _get_edition_or_404(edition_id, db)
    return await _edition_to_response(edition)


@router.patch("/editions/{edition_id}", response_model=EditionResponse)
async def update_edition(
    edition_id: uuid.UUID,
    body: EditionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("DIAGRAMADOR", "ADMIN")),
):
    edition = await _get_edition_or_404(edition_id, db)
    if not edition.can_edit():
        raise HTTPException(422, f"Cannot edit edition in status '{_status_value(edition.status)}'")
    if body.title is not None:
        edition.title = body.title.strip()
    if body.subtitle is not None:
        edition.subtitle = body.subtitle.strip() or None
    if body.publication_date is not None:
        edition.publication_date = body.publication_date
    await db.commit()
    await db.refresh(edition, attribute_names=["updated_at"])
    return await _edition_to_response(edition)


# ── Items ────────────────────────────────────────────────────────────────────


@router.get("/editions/{edition_id}/items", response_model=list[EditionItemOut])
async def list_items(
    edition_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    edition = await _get_edition_or_404(edition_id, db)
    return [
        EditionItemOut(
            id=i.id, matter_id=i.matter_id,
            matter_title=i.matter.title if i.matter else "",
            section_title=i.section_title, position=i.position,
            page_number=i.page_number,
        )
        for i in (edition.items or [])
    ]


@router.post("/editions/{edition_id}/items", response_model=EditionResponse, status_code=201)
async def add_item(
    edition_id: uuid.UUID,
    body: AddItemRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("DIAGRAMADOR", "ADMIN")),
):
    edition = await _get_edition_or_404(edition_id, db)
    if not EditionStatus.can_add_items(edition.status):
        raise HTTPException(422, f"Cannot add items to edition in status '{_status_value(edition.status)}'")

    matter_result = await db.execute(
        select(Matter).where(Matter.id == body.matter_id)
    )
    matter = matter_result.scalar_one_or_none()
    if matter is None:
        raise HTTPException(404, "Matter not found")
    if matter.status != MatterStatus.APPROVED:
        raise HTTPException(422, "Only APPROVED matters can be added to an edition")

    existing = await db.execute(
        select(EditionItem).where(
            EditionItem.edition_id == edition_id,
            EditionItem.matter_id == body.matter_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Matter already in edition")

    max_pos = await db.execute(
        select(func.coalesce(func.max(EditionItem.position), -1))
        .where(EditionItem.edition_id == edition_id)
    )
    next_pos = max_pos.scalar() + 1

    item = EditionItem(
        edition_id=edition_id,
        matter_id=body.matter_id,
        section_title=body.section_title,
        position=body.position if body.position is not None else next_pos,
    )
    db.add(item)
    await db.commit()

    info = await capture_request_info(request)
    await log_audit_event(
        db=db, action=AuditAction.EDITION_UPDATED,
        user_id=user.id, organization_id=user.organization_id,
        entity_type="edition", entity_id=edition.id,
        description=f"Matter '{matter.title}' added to edition",
        ip_address=info["ip_address"],
    )

    # item_count fix: SQLAlchemy keeps the already-eager-loaded ``edition.items``
    # collection stale in the identity map after the insert, so building the
    # response from it returns a defasado count. Expire the collection and
    # re-select via the helper (which eager-loads items + nested matter), so the
    # response reflects the state immediately after the addition.
    db.expire(edition, ["items"])
    fresh = await _get_edition_or_404(edition_id, db)
    return await _edition_to_response(fresh)


@router.patch("/editions/{edition_id}/items/reorder", response_model=list[EditionItemOut])
async def reorder_items(
    edition_id: uuid.UUID,
    body: ReorderRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("DIAGRAMADOR", "ADMIN")),
):
    edition = await _get_edition_or_404(edition_id, db)
    if not EditionStatus.can_add_items(edition.status):
        raise HTTPException(422, f"Cannot reorder items in status '{_status_value(edition.status)}'")

    item_ids = {i.id for i in body.items}
    for item in edition.items or []:
        if item.id in item_ids:
            new_pos = next(i.position for i in body.items if i.id == item.id)
            item.position = new_pos
    await db.commit()

    return [
        EditionItemOut(
            id=i.id, matter_id=i.matter_id,
            matter_title=i.matter.title if i.matter else "",
            section_title=i.section_title, position=i.position,
            page_number=i.page_number,
        )
        for i in sorted(edition.items or [], key=lambda x: x.position)
    ]


@router.delete("/editions/{edition_id}/items/{item_id}", status_code=204)
async def remove_item(
    edition_id: uuid.UUID,
    item_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("DIAGRAMADOR", "ADMIN")),
):
    edition = await _get_edition_or_404(edition_id, db)
    if not EditionStatus.can_add_items(edition.status):
        raise HTTPException(422, f"Cannot remove items in status '{_status_value(edition.status)}'")

    result = await db.execute(
        select(EditionItem).where(
            EditionItem.id == item_id,
            EditionItem.edition_id == edition_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(404, "Item not found")
    await db.delete(item)
    await db.commit()


# ── Status ───────────────────────────────────────────────────────────────────


@router.post("/editions/{edition_id}/close", response_model=EditionResponse)
async def close_edition(
    edition_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("DIAGRAMADOR", "ADMIN")),
):
    edition = await _get_edition_or_404(edition_id, db)
    if not edition.verification_code:
        edition.generate_verification_code()
    edition_meta = {
        "id": edition.id,
        "organization_id": edition.organization_id,
        "year": edition.year,
        "number": edition.number,
        "type": _status_value(edition.type),
        "title": edition.title,
        "subtitle": edition.subtitle,
        "publication_date": edition.publication_date,
        "verification_code": edition.verification_code,
    }
    edition.change_status(EditionStatus.CLOSED)
    await db.commit()
    await db.refresh(edition, attribute_names=["updated_at"])

    # The frozen snapshot is mandatory: web, PDF and validation must all refer
    # to exactly the same canonical content. Fail closed if freezing fails.
    from app.models.edition_publication_snapshot import EditionPublicationSnapshot
    existing = await db.execute(
        select(EditionPublicationSnapshot)
        .where(
            EditionPublicationSnapshot.edition_id == edition_id,
            EditionPublicationSnapshot.is_valid.is_(True),
        )
        .limit(1)
    )
    if existing.scalar_one_or_none() is None:
        from app.services.edition_snapshot import create_edition_snapshot
        await create_edition_snapshot(db, edition_meta, user_id=user.id)
        await db.commit()

    # Auto-generate PDF after closing.
    # Preferred: enqueue to the Celery worker (non-blocking). If the broker is
    # unavailable or async mode is disabled, generate synchronously so the
    # edition is never left without a PDF by accident.
    from app.core.celery_client import enqueue_generate_edition_pdf

    enqueued = enqueue_generate_edition_pdf(str(edition_id))
    if not enqueued:
        from app.models.organization import Organization
        from app.services.edition_pdf import generate_edition_pdf_sync
        org_result = await db.execute(
            select(Organization).where(Organization.id == edition_meta["organization_id"])
        )
        organization = org_result.scalar_one_or_none()
        organ_name = organization.name if organization else None
        pdf_layout = organization.pdf_layout if organization else "classico"
        try:
            generate_edition_pdf_sync(
                edition_id=str(edition_id),
                organ_name=organ_name,
                layout=pdf_layout,
            )
        except Exception as e:
            import logging
            logging.getLogger("doe").warning(f"Auto PDF generation failed for edition {edition_id}: {e}")

    # Refresh from DB to pick up pdf_path/pdf_hash set by the sync session
    await db.refresh(edition, attribute_names=["pdf_path", "pdf_hash", "status", "updated_at"])

    info = await capture_request_info(request)
    await log_audit_event(
        db=db, action=AuditAction.EDITION_STATUS_CHANGED,
        user_id=user.id, organization_id=user.organization_id,
        entity_type="edition", entity_id=edition.id,
        description=f"Edition {edition.year}/{edition.number} closed and PDF generated",
        extra_metadata={"from": "draft/reviewing/scheduled", "to": _status_value(edition.status)},
        ip_address=info["ip_address"],
    )
    await db.refresh(edition, attribute_names=["updated_at"])
    return await _edition_to_response(edition)


@router.post("/editions/{edition_id}/reopen", response_model=EditionResponse)
async def reopen_edition(
    edition_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("DIAGRAMADOR", "ADMIN")),
):
    edition = await _get_edition_or_404(edition_id, db)
    if not EditionStatus.can_reopen(edition.status):
        raise HTTPException(422, f"Cannot reopen edition in status '{_status_value(edition.status)}'")

    if edition.signatures:
        raise HTTPException(422, "Cannot reopen an edition that has already been signed")

    edition.change_status(EditionStatus.DRAFT)
    await db.commit()
    await db.refresh(edition, attribute_names=["updated_at"])

    info = await capture_request_info(request)
    await log_audit_event(
        db=db, action=AuditAction.EDITION_STATUS_CHANGED,
        user_id=user.id, organization_id=user.organization_id,
        entity_type="edition", entity_id=edition.id,
        description=f"Edition {edition.year}/{edition.number} reopened",
        extra_metadata={"from": "closed", "to": "draft"},
        ip_address=info["ip_address"],
    )
    await db.refresh(edition, attribute_names=["updated_at"])
    return await _edition_to_response(edition)


@router.post("/editions/{edition_id}/cancel", response_model=EditionResponse)
async def cancel_edition(
    edition_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "DIAGRAMADOR", "ADMIN")),
):
    edition = await _get_edition_or_404(edition_id, db)
    edition.change_status(EditionStatus.CANCELLED)
    await db.commit()
    await db.refresh(edition, attribute_names=["updated_at"])
    info = await capture_request_info(request)
    await log_audit_event(
        db=db, action=AuditAction.EDITION_STATUS_CHANGED,
        user_id=user.id, organization_id=user.organization_id,
        entity_type="edition", entity_id=edition.id,
        description=f"Edition {edition.year}/{edition.number} cancelled",
        extra_metadata={"to": "cancelled"},
        ip_address=info["ip_address"],
    )
    await db.refresh(edition, attribute_names=["updated_at"])
    return await _edition_to_response(edition)


@router.delete("/editions/{edition_id}", status_code=204)
async def delete_edition(
    edition_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "ADMIN")),
):
    edition = await _get_edition_or_404(edition_id, db)
    if edition.status == EditionStatus.PUBLISHED:
        raise HTTPException(409, "Cannot delete a published edition")
    await db.delete(edition)
    await db.commit()


@router.post("/editions/{edition_id}/generate-pdf", response_model=dict)
async def generate_edition_pdf(
    edition_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("DIAGRAMADOR", "ADMIN")),
):
    edition = await _get_edition_or_404(edition_id, db)
    if edition.status not in (EditionStatus.CLOSED, EditionStatus.PDF_GENERATED):
        raise HTTPException(
            422,
            f"Edition must be CLOSED or PDF_GENERATED to generate PDF, current: {_status_value(edition.status)}",
        )
    if edition.status == EditionStatus.SIGNED:
        raise HTTPException(409, "Cannot regenerate PDF for a signed edition")

    from app.models.organization import Organization
    from app.services.edition_pdf import generate_edition_pdf_sync

    org_result = await db.execute(
        select(Organization).where(Organization.id == edition.organization_id)
    )
    organization = org_result.scalar_one_or_none()
    organ_name = organization.name if organization else None
    pdf_layout = organization.pdf_layout if organization else "classico"

    result = generate_edition_pdf_sync(
        edition_id=str(edition_id),
        organ_name=organ_name,
        layout=pdf_layout,
    )
    edition.pdf_path = result["filename"]
    edition.pdf_hash = result["sha256"]
    edition.status = EditionStatus.PDF_GENERATED
    await db.commit()
    return result


# ── Signing ──────────────────────────────────────────────────────────────────


@router.post("/editions/{edition_id}/sign", response_model=SignResponse)
async def sign_edition(
    edition_id: uuid.UUID,
    body: SignRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSINADOR", "ADMIN")),
):
    edition = await _get_edition_or_404(edition_id, db)
    if not EditionStatus.can_sign(edition.status):
        raise HTTPException(
            422, f"Edition must be PDF_GENERATED to sign, current: {_status_value(edition.status)}"
        )
    if not edition.pdf_path or not edition.pdf_hash:
        raise HTTPException(422, "Edition has no generated PDF")

    if not edition.verification_code:
        edition.generate_verification_code()
        await db.commit()

    credential = None
    pfx_b64 = body.pfx_base64 or ""
    pfx_pass = body.pfx_password or ""
    if body.signing_credential_id:
        import base64
        cred_result = await db.execute(
            select(SigningCredential).where(
                SigningCredential.id == body.signing_credential_id,
                SigningCredential.is_active,
            )
        )
        credential = cred_result.scalar_one_or_none()
        if credential is None:
            raise HTTPException(404, "Signing credential not found")

        from app.services.credential_secrets import decrypt_credential_secrets
        pfx_bytes, _ = decrypt_credential_secrets(credential)
        pfx_b64 = base64.b64encode(pfx_bytes).decode("utf-8")
        if not body.pfx_password:
            raise HTTPException(422, "Informe a senha do certificado")
        pfx_pass = body.pfx_password

    from app.models.organization import Organization

    org_result = await db.execute(
        select(Organization).where(Organization.id == edition.organization_id)
    )
    organization = org_result.scalar_one_or_none()
    organ_name = organization.name if organization else None
    pdf_layout = organization.pdf_layout if organization else "classico"

    pdf_full_path = os.path.join(api_settings.UPLOAD_DIR, edition.pdf_path)

    if not os.path.exists(pdf_full_path):
        # Fase 3: a assinatura NÃO re-gera o PDF. O PDF da pré-visualização
        # (imutável, não assinado) deve existir no storage; caso contrário a
        # operação falha claramente e a edição permanece sem status SIGNED.
        raise HTTPException(422, "PDF não assinado não encontrado no storage. Gere o PDF novamente antes de assinar.")

    with open(pdf_full_path, "rb") as f:
        pdf_bytes = f.read()

    source_pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
    expected_source_hash = edition.source_pdf_hash or edition.pdf_hash
    if not expected_source_hash or not hmac.compare_digest(source_pdf_hash, expected_source_hash):
        raise HTTPException(
            409,
            "PDF não assinado foi alterado após a geração. Gere o PDF novamente antes de assinar.",
        )

    import base64
    result = None
    operation_id = uuid.uuid4().hex
    correlation_id = uuid.uuid4().hex
    start_time = datetime.now(timezone.utc)
    try:
        import httpx
        signer_payload = {
            "edition_id": str(edition_id),
            "unsigned_pdf_base64": base64.b64encode(pdf_bytes).decode("utf-8"),
            "pfx_base64": pfx_b64,
            "pfx_password": pfx_pass,
            "reason": body.reason or "Assinatura de Edição",
            "location": body.location or "",
            "visible": body.visible or False,
            "verification_code": edition.verification_code or "",
            "correlation_id": correlation_id,
        }
        async with httpx.AsyncClient() as http_client:
            signer_resp = await http_client.post(
                f"{settings.SIGNER_URL}/internal/sign-pdf",
                json=signer_payload,
                headers={"X-Internal-Key": settings.INTERNAL_API_KEY.get_secret_value()},
                timeout=120,
            )
        if signer_resp.status_code != 200:
            raise RuntimeError(f"Signer error: {signer_resp.text}")
        result = signer_resp.json()
    except Exception as e:
        await _record_signature_operation(
            db=db,
            operation_id=operation_id,
            organization_id=edition.organization_id,
            edition_id=edition.id,
            credential_id=credential.id if credential else None,
            provider=credential.provider_type if credential else "a1",
            requested_by=user.id,
            started_at=start_time,
            finished_at=datetime.now(timezone.utc),
            result="failed",
            source_hash=source_pdf_hash,
            signed_hash=None,
            certificate_serial=credential.certificate_serial if credential else None,
            correlation_id=correlation_id,
            client_service="api",
            error=str(e),
        )
        await db.commit()
        raise HTTPException(502, f"Signing service failed: {e}")

    # Cross-check: o signer deve ter assinado exatamente os bytes enviados.
    if result.get("sha256_original") and result["sha256_original"] != source_pdf_hash:
        raise HTTPException(502, "Hash do PDF recebido pelo signer difere do source_pdf_hash")

    signed_bytes = base64.b64decode(result["signed_pdf_base64"])
    signed_pdf_hash = hashlib.sha256(signed_bytes).hexdigest()
    if result.get("sha256_signed") and result["sha256_signed"] != signed_pdf_hash:
        raise HTTPException(502, "Hash do PDF assinado difere do informado pelo signer")

    # Só prossegue para SIGNED se o signer confirmou a validação criptográfica.
    if result.get("validation_status") != "ok":
        raise HTTPException(502, "Falha na validação criptográfica pós-assinatura no signer")

    # content_manifest_hash was produced from the canonical frozen snapshot at
    # close time. Never replace it with a second, incompatible hash scheme.
    if not edition.content_manifest_hash:
        raise HTTPException(409, "Snapshot canônico/hash do manifesto ausente")
    edition.renderer_version = "weasyprint"
    edition.layout_version = pdf_layout

    sig_filename = f"signed_{edition.year}_{edition.number}_{uuid.uuid4().hex[:8]}.pdf"
    from app.core.storage import storage as store_backend
    if organization:
        from app.core.storage import set_storage_tenant as _set_tenant
        _set_tenant(organization.slug)
    await store_backend.store(sig_filename, signed_bytes)

    signed_at = datetime.now(timezone.utc)
    # Metadados completos (não truncados); o PDF assinado íntegro fica no storage.
    sig_record = Signature(
        edition_id=edition.id,
        user_id=user.id,
        signing_credential_id=credential.id if credential else None,
        signed_at=signed_at,
        signature_data=f"storage://{sig_filename}",
        certificate_info={
            "subject": result["certificate_subject"],
            "serial": result["certificate_serial"],
            "thumbprint": result["certificate_thumbprint"],
            "issuer": result.get("certificate_issuer", ""),
            "valid_from": result.get("valid_from", ""),
            "valid_to": result.get("valid_to", ""),
            "policy_oid": result.get("policy_oid", ""),
            "signature_format": result.get("signature_format", "PAdES"),
            "sha256_original": source_pdf_hash,
            "sha256_signed": signed_pdf_hash,
            "verification_code": result.get("verification_code") or edition.verification_code or "",
            "validation_status": result.get("validation_status", ""),
        },
        is_valid=True,
    )
    db.add(sig_record)

    edition.signed_pdf_path = sig_filename
    edition.source_pdf_hash = source_pdf_hash
    edition.signed_pdf_hash = signed_pdf_hash
    edition.pdf_hash = signed_pdf_hash  # legado
    edition.immutability_hash = edition.compute_immutability_hash()
    edition.signature_validation_status = "valid"
    edition.signature_validation_details = {
        "integrity": True,
        "signature_valid": True,
        "chain_trusted": False,
        "revocation_status": "not_checked",
        "timestamp_status": "not_present",
        "pades_profile": "PAdES-B-B / ICP-Brasil AD-RB",
    }
    edition.change_status(EditionStatus.SIGNED)
    await db.commit()

    await _record_signature_operation(
        db=db,
        operation_id=operation_id,
        organization_id=edition.organization_id,
        edition_id=edition.id,
        credential_id=credential.id if credential else None,
        provider=credential.provider_type if credential else "a1",
        requested_by=user.id,
        started_at=start_time,
        finished_at=datetime.now(timezone.utc),
        result="success",
        source_hash=source_pdf_hash,
        signed_hash=signed_pdf_hash,
        certificate_serial=result["certificate_serial"],
        correlation_id=correlation_id,
        client_service="api",
    )
    await db.commit()

    info = await capture_request_info(request)
    await log_audit_event(
        db=db, action=AuditAction.EDITION_SIGNED,
        user_id=user.id, organization_id=user.organization_id,
        entity_type="edition", entity_id=edition.id,
        description=f"Edition {edition.year}/{edition.number} signed",
        ip_address=info["ip_address"],
    )

    return SignResponse(
        verification_code=edition.verification_code or "",
        signed_pdf_hash=result["sha256_signed"],
        certificate_subject=result["certificate_subject"],
        certificate_serial=result["certificate_serial"],
        signed_at=signed_at.isoformat(),
        message="Edition signed successfully",
    )


@router.post("/editions/{edition_id}/validate-signature", response_model=ValidateSignatureResponse)
async def validate_edition_signature(
    edition_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    edition = await _get_edition_or_404(edition_id, db)
    if not edition.signatures or len(edition.signatures) == 0:
        raise HTTPException(404, "No signatures found for this edition")

    sig = edition.signatures[0]
    cert_info = sig.certificate_info or {}
    issues = []
    valid = True

    if not edition.pdf_hash:
        issues.append("No PDF hash recorded")
        valid = False
    if not edition.immutability_hash:
        issues.append("No immutability hash recorded")
        valid = False
    else:
        expected = edition.compute_immutability_hash()
        if edition.immutability_hash != expected:
            issues.append("Immutability hash mismatch")
            valid = False

    # Re-verify cryptographically through the signer when the signed PDF exists.
    stored_report = {}
    import base64
    import hashlib as _hl

    from app.services.signature_validation import SignatureValidationService

    svc = SignatureValidationService()
    actual_signed_hash = None
    signed_path = edition.signed_pdf_path
    if signed_path:
        import os as _os
        pdf_full_path = _os.path.join(api_settings.UPLOAD_DIR, signed_path)
        if _os.path.exists(pdf_full_path):
            try:
                with open(pdf_full_path, "rb") as f:
                    signed_bytes = f.read()
                actual_signed_hash = _hl.sha256(signed_bytes).hexdigest()
                import httpx
                resp = await httpx.AsyncClient().post(
                    f"{settings.SIGNER_URL}/internal/verify-pdf",
                    json={"signed_pdf_base64": base64.b64encode(signed_bytes).decode("utf-8")},
                    headers={"X-Internal-Key": settings.INTERNAL_API_KEY.get_secret_value()},
                    timeout=60,
                )
                if resp.status_code == 200:
                    stored_report = resp.json()
                    if stored_report.get("warnings"):
                        issues.extend(stored_report.get("warnings", []))
                else:
                    issues.append(f"Signer verify returned {resp.status_code}")
            except Exception as e:  # noqa: BLE001
                issues.append(f"Signer verify unavailable: {e}")

    # Chain/cert trust is only asserted via the recorded validation metadata.
    chain_trusted = bool(cert_info.get("chain_trusted"))
    certificate_valid = bool(edition.signature_validation_status == "valid")
    timestamp_status = edition.signature_validation_status or "pending_validation"

    result = svc.normalize(
        stored_report,
        signed_pdf_hash=edition.signed_pdf_hash,
        actual_signed_hash=actual_signed_hash,
        certificate_valid=certificate_valid,
        chain_trusted=chain_trusted,
        timestamp_status=timestamp_status,
    )

    normalized_status = result.status
    if not valid:
        issues.append("Stored integrity hashes inconsistent")
    final_status = "valid" if (valid and result.integrity and no_hard_errors(result.errors)) else "invalid"

    # Persist the validation outcome.
    edition.signature_validation_status = final_status
    edition.signature_validation_details = result.to_dict()

    info = await capture_request_info(request)
    await log_audit_event(
        db=db, action=AuditAction.EDITION_SIGNED,
        user_id=user.id, organization_id=user.organization_id,
        entity_type="edition", entity_id=edition.id,
        description=f"Signature re-validated for edition {edition.year}/{edition.number} -> {final_status}",
        ip_address=info["ip_address"],
    )
    await db.commit()

    return ValidateSignatureResponse(
        edition_id=str(edition.id),
        status=final_status,
        signed_at=sig.signed_at.isoformat() if sig.signed_at else "",
        certificate_subject=cert_info.get("subject", ""),
        certificate_serial=cert_info.get("serial", ""),
        certificate_thumbprint=cert_info.get("thumbprint", ""),
        verification_code=edition.verification_code or "",
        issues=issues,
        recommendation="OK" if final_status == "valid" else "Re-sign required",
    )


# ── Publication ──────────────────────────────────────────────────────────────


@router.post("/editions/{edition_id}/publish", response_model=PublishResponse)
async def publish_edition(
    edition_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("PUBLICADOR", "ADMIN")),
):
    edition = await _get_edition_or_404(edition_id, db)
    # Fase 12: publicação é uma operação crítica. Se a política estiver ativa,
    # exige reautenticação forte (MFA) recente. O frontend deve enviar
    # `X-Recent-Auth` (emitido pelo MFA) — controlado por flag para não quebrar
    # o fluxo atual até a UI ser atualizada.
    from app.core.config import settings as _cfg

    if getattr(_cfg, "REQUIRE_RECENT_AUTH_FOR_PUBLISH", False):
        from app.services.recent_auth import validate_recent_auth

        token = request.headers.get("X-Recent-Auth")
        if not token or not validate_recent_auth(token, user.id):
            raise HTTPException(
                403,
                "Reautenticação forte (MFA) recente é obrigatória para publicar esta edição.",
            )
    if edition.status == EditionStatus.PUBLISHED:
        return PublishResponse(
            edition_id=str(edition.id),
            status="published",
            published_at=edition.published_at.isoformat() if edition.published_at else "",
            verification_code=edition.verification_code or "",
            immutability_hash=edition.immutability_hash or "",
            message="Edition already published",
        )

    if not EditionStatus.can_publish(edition.status):
        raise HTTPException(
            422,
            f"Edition must be SIGNED to publish, current: {_status_value(edition.status)}",
        )
    if not edition.signatures:
        raise HTTPException(422, "Edition has no signatures")
    if not edition.signed_pdf_path or not edition.signed_pdf_hash:
        raise HTTPException(422, "Artefato PDF assinado imutável ausente")
    if edition.signature_validation_status != "valid":
        raise HTTPException(422, "A assinatura digital ainda não foi validada")

    from app.core.public_utils import read_public_file
    from app.models.organization import Organization
    org_result = await db.execute(select(Organization).where(Organization.id == edition.organization_id))
    organization = org_result.scalar_one_or_none()
    stored_bytes, _mime = read_public_file(
        edition.signed_pdf_path,
        organization.slug if organization else None,
    )
    if stored_bytes is None or hashlib.sha256(stored_bytes).hexdigest() != edition.signed_pdf_hash:
        raise HTTPException(409, "PDF assinado ausente ou com hash divergente")

    # Validate all matters can transition to PUBLISHED before any DB changes
    from app.services.search_indexer import get_search_provider
    indexer = get_search_provider()
    failed_matters: list[dict[str, str]] = []
    for item in edition.items or []:
        if not item.matter:
            continue
        matter = item.matter
        # status vem do banco como str (coluna String); normaliza para o enum
        # antes de chamar métodos de instância como can_transition_to.
        matter_status = MatterStatus(matter.status)
        if matter_status == MatterStatus.PUBLISHED:
            continue
        if not matter_status.can_transition_to(MatterStatus.PUBLISHED):
            failed_matters.append({
                "id": str(matter.id),
                "title": matter.title or "Sem título",
                "status": matter_status.value,
            })

    if failed_matters:
        raise HTTPException(
            422,
            {
                "message": (
                    "Algumas matérias não estão em status APPROVED "
                    "e não podem ser publicadas"
                ),
                "failed_matters": failed_matters,
            },
        )

    edition.change_status(EditionStatus.PUBLISHED)
    edition.published_at = datetime.now(timezone.utc)
    edition.published_by = user.id
    if not edition.verification_code:
        edition.generate_verification_code()
    if not edition.immutability_hash:
        edition.immutability_hash = edition.compute_immutability_hash()

    # Mark matters as published and index before committing
    for item in edition.items or []:
        if not item.matter:
            continue
        matter = item.matter
        if matter.status == MatterStatus.PUBLISHED:
            continue
        matter.change_status(MatterStatus.PUBLISHED)
        matter.published_at = datetime.now(timezone.utc)
        try:
            await indexer.index_matter(matter, edition, db)
        except Exception as exc:
            logger.warning(
                "Failed to index matter %s during publish: %s", matter.id, exc
            )

    # Audit event commits the whole transaction atomically
    info = await capture_request_info(request)
    await log_audit_event(
        db=db, action=AuditAction.EDITION_PUBLISHED,
        user_id=user.id, organization_id=user.organization_id,
        entity_type="edition", entity_id=edition.id,
        description=f"Edition {edition.year}/{edition.number} published",
        ip_address=info["ip_address"],
    )

    return PublishResponse(
        edition_id=str(edition.id),
        status="published",
        published_at=edition.published_at.isoformat() if edition.published_at else "",
        verification_code=edition.verification_code or "",
        immutability_hash=edition.immutability_hash or "",
        message="Edition published successfully",
    )
