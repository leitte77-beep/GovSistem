import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_roles
from app.core.config import settings
from app.core.database import get_db
from app.middleware.audit import capture_request_info, log_audit_event
from app.models.edition import Edition
from app.models.edition_item import EditionItem
from app.models.enums import AuditAction, EditionStatus, EditionType, MatterStatus
from app.models.matter import Matter
from app.models.signature import Signature
from app.models.signing_credential import SigningCredential
from app.models.user import User
from app.schemas.edition import (
    AddItemRequest,
    EditionCreate,
    EditionItemOut,
    EditionListResponse,
    EditionResponse,
    EditionUpdate,
    PublishResponse,
    ReorderRequest,
    SignRequest,
    SignResponse,
    ValidateSignatureResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["editions"])


def _status_value(status) -> str:
    return status.value if hasattr(status, "value") else str(status)


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
    existing = await db.execute(
        select(Edition).where(
            Edition.year == body.year,
            Edition.number == body.number,
            Edition.type == body.type,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail=f"Edition {body.number}/{body.year} ({body.type.value}) already exists",
        )

    edition = Edition(
        organization_id=user.organization_id,
        number=body.number,
        year=body.year,
        type=body.type,
        title=body.title.strip(),
        subtitle=body.subtitle.strip() if body.subtitle else None,
        publication_date=body.publication_date,
        status=EditionStatus.DRAFT,
        created_by=user.id,
    )
    db.add(edition)
    await db.commit()
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
            created_at=e.created_at, item_count=len(e.items or []),
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
    await db.refresh(edition)
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
    await db.refresh(edition)

    info = await capture_request_info(request)
    await log_audit_event(
        db=db, action=AuditAction.EDITION_UPDATED,
        user_id=user.id, organization_id=user.organization_id,
        entity_type="edition", entity_id=edition.id,
        description=f"Matter '{matter.title}' added to edition",
        ip_address=info["ip_address"],
    )
    return await _edition_to_response(edition)


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
    await db.refresh(edition)

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
    edition.change_status(EditionStatus.CLOSED)
    await db.commit()
    await db.refresh(edition)

    # Auto-generate PDF after closing (uses its own sync session)
    from app.services.edition_pdf import generate_edition_pdf_sync
    from app.models.organization import Organization
    org_result = await db.execute(
        select(Organization).where(Organization.id == edition.organization_id)
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
    await db.refresh(edition)

    info = await capture_request_info(request)
    await log_audit_event(
        db=db, action=AuditAction.EDITION_STATUS_CHANGED,
        user_id=user.id, organization_id=user.organization_id,
        entity_type="edition", entity_id=edition.id,
        description=f"Edition {edition.year}/{edition.number} closed and PDF generated",
        extra_metadata={"from": "draft/reviewing/scheduled", "to": _status_value(edition.status)},
        ip_address=info["ip_address"],
    )
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
    await db.refresh(edition)

    info = await capture_request_info(request)
    await log_audit_event(
        db=db, action=AuditAction.EDITION_STATUS_CHANGED,
        user_id=user.id, organization_id=user.organization_id,
        entity_type="edition", entity_id=edition.id,
        description=f"Edition {edition.year}/{edition.number} reopened",
        extra_metadata={"from": "closed", "to": "draft"},
        ip_address=info["ip_address"],
    )
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
    await db.refresh(edition)
    info = await capture_request_info(request)
    await log_audit_event(
        db=db, action=AuditAction.EDITION_STATUS_CHANGED,
        user_id=user.id, organization_id=user.organization_id,
        entity_type="edition", entity_id=edition.id,
        description=f"Edition {edition.year}/{edition.number} cancelled",
        extra_metadata={"to": "cancelled"},
        ip_address=info["ip_address"],
    )
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

    from app.services.edition_pdf import generate_edition_pdf_sync
    from app.models.organization import Organization

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

        from app.services.encryption import decrypt_bytes
        try:
            pfx_encrypted = credential.config.get("pfx_encrypted", "")
            pfx_b64 = base64.b64encode(decrypt_bytes(pfx_encrypted.encode("utf-8"))).decode("utf-8")
            if not body.pfx_password:
                raise HTTPException(422, "Informe a senha do certificado")
            pfx_pass = body.pfx_password
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(500, f"Erro ao descriptografar certificado: {e}")

    from app.core.config import settings as api_settings
    from app.models.organization import Organization

    org_result = await db.execute(
        select(Organization).where(Organization.id == edition.organization_id)
    )
    organization = org_result.scalar_one_or_none()
    organ_name = organization.name if organization else None
    pdf_layout = organization.pdf_layout if organization else "classico"

    pdf_full_path = os.path.join(api_settings.UPLOAD_DIR, edition.pdf_path)

    if not os.path.exists(pdf_full_path):
        from app.services.edition_pdf import generate_edition_pdf_sync
        generated = generate_edition_pdf_sync(
            edition_id=str(edition_id),
            organ_name=organ_name,
            layout=pdf_layout,
        )
        edition.pdf_path = generated["filename"]
        edition.pdf_hash = generated["sha256"]

    if not os.path.exists(pdf_full_path):
        raise HTTPException(404, "PDF file not found in storage")

    with open(pdf_full_path, "rb") as f:
        pdf_bytes = f.read()

    import base64
    result = None
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
        raise HTTPException(502, f"Signing service failed: {e}")

    signed_bytes = base64.b64decode(result["signed_pdf_base64"])
    sig_filename = f"signed_{edition.year}_{edition.number}_{uuid.uuid4().hex[:8]}.pdf"
    from app.core.storage import storage as store_backend
    if organization:
        from app.core.storage import set_storage_tenant as _set_tenant
        _set_tenant(organization.slug)
    await store_backend.store(sig_filename, signed_bytes)

    signed_at = datetime.now(timezone.utc)
    sig_record = Signature(
        edition_id=edition.id,
        user_id=user.id,
        signing_credential_id=credential.id if credential else None,
        signed_at=signed_at,
        signature_data=result["signed_pdf_base64"][:1000],  # store truncated
        certificate_info={
            "subject": result["certificate_subject"],
            "serial": result["certificate_serial"],
            "thumbprint": result["certificate_thumbprint"],
            "issuer": result.get("certificate_issuer", ""),
            "valid_from": result.get("valid_from", ""),
            "valid_to": result.get("valid_to", ""),
            "policy_oid": result.get("policy_oid", "2.16.76.1.7.1.11.1.3"),
            "signature_format": result.get("signature_format", "PAdES"),
            "sha256_original": result.get("sha256_original", ""),
            "sha256_signed": result["sha256_signed"],
            "verification_code": result.get("verification_code") or edition.verification_code or "",
        },
        is_valid=True,
    )
    db.add(sig_record)

    edition.signed_pdf_path = sig_filename
    edition.pdf_hash = result["sha256_signed"]
    edition.immutability_hash = edition.compute_immutability_hash()
    edition.change_status(EditionStatus.SIGNED)
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

    return ValidateSignatureResponse(
        edition_id=str(edition.id),
        status="valid" if valid else "invalid",
        signed_at=sig.signed_at.isoformat() if sig.signed_at else "",
        certificate_subject=cert_info.get("subject", ""),
        certificate_serial=cert_info.get("serial", ""),
        certificate_thumbprint=cert_info.get("thumbprint", ""),
        verification_code=edition.verification_code or "",
        issues=issues,
        recommendation="OK" if valid else "Re-sign required",
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

    # Validate all matters can transition to PUBLISHED before any DB changes
    from app.services.search_indexer import get_search_provider
    indexer = get_search_provider()
    failed_matters: list[dict[str, str]] = []
    for item in edition.items or []:
        if not item.matter:
            continue
        matter = item.matter
        if matter.status == MatterStatus.PUBLISHED:
            continue
        if not matter.status.can_transition_to(MatterStatus.PUBLISHED):
            failed_matters.append({
                "id": str(matter.id),
                "title": matter.title or "Sem título",
                "status": matter.status.value,
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
