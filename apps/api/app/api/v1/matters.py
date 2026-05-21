import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.core.html_sanitizer import extract_plain_text
from app.middleware.audit import capture_request_info, log_audit_event
from app.models.act_type import ActType
from app.models.enums import AuditAction, MatterStatus
from app.models.file import File
from app.models.matter import Matter
from app.models.matter_attachment import MatterAttachment
from app.models.org_unit import OrgUnit
from app.models.user import User
from app.schemas.matter import (
    AttachmentOut,
    MatterCreate,
    MatterListResponse,
    MatterNextTitleResponse,
    MatterResponse,
    MatterUpdate,
    MessageResponse,
)

router = APIRouter(tags=["matters"])

TITLE_NUMBER_RE = re.compile(r"(?:^|\D)(\d+)(?:/\d+)?$")


async def _get_matter_or_404(
    matter_id: uuid.UUID, db: AsyncSession
) -> Matter:
    result = await db.execute(
        select(Matter)
        .where(Matter.id == matter_id)
        .options(
            selectinload(Matter.attachments),
            selectinload(Matter.act_type),
            selectinload(Matter.org_unit),
            selectinload(Matter.author),
            selectinload(Matter.reviewer),
        )
    )
    matter = result.scalar_one_or_none()
    if matter is None:
        raise HTTPException(status_code=404, detail="Matter not found")
    return matter


def _own_matter_or_admin(matter: Matter, user: User) -> None:
    user_roles = {ur.role.name for ur in user.user_roles}
    if "ADMIN" in user_roles:
        return
    if matter.author_id != user.id:
        raise HTTPException(
            status_code=403, detail="You can only access your own matters"
        )


async def _entity_exists_or_404(
    model, entity_id: uuid.UUID, db: AsyncSession, label: str = "Entity"
):
    result = await db.execute(select(model).where(model.id == entity_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=404, detail=f"{label} not found"
        )


# ── CRUD ─────────────────────────────────────────────────────────────────────


@router.get("/matters/next-title", response_model=MatterNextTitleResponse)
async def get_next_matter_title(
    act_type_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "ADMIN")),
):
    result = await db.execute(
        select(ActType).where(ActType.id == act_type_id)
    )
    act_type = result.scalar_one_or_none()
    if act_type is None:
        raise HTTPException(status_code=404, detail="ActType not found")

    matter_result = await db.execute(
        select(Matter.title).where(
            Matter.organization_id == user.organization_id,
            Matter.act_type_id == act_type_id,
            Matter.status.in_([MatterStatus.APPROVED, MatterStatus.PUBLISHED]),
        )
    )

    last_number = 0
    number_width = 2
    for title in matter_result.scalars().all():
        match = TITLE_NUMBER_RE.search(title or "")
        if not match:
            continue

        value = int(match.group(1))
        if value > last_number:
            last_number = value
            number_width = max(2, len(match.group(1)))

    next_number = last_number + 1
    prefix = act_type.name.upper()
    import datetime
    year = datetime.date.today().year
    return MatterNextTitleResponse(
        title=f"{prefix} – {next_number:0{number_width}d}/{year}",
        next_number=next_number,
        last_number=last_number,
    )


@router.post("/matters", response_model=MatterResponse, status_code=201)
async def create_matter(
    body: MatterCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "ADMIN")),
):
    await _entity_exists_or_404(
        ActType, body.act_type_id, db, "ActType"
    )
    if body.org_unit_id:
        await _entity_exists_or_404(
            OrgUnit, body.org_unit_id, db, "OrgUnit"
        )

    plain_text = extract_plain_text(body.content_html)
    matter = Matter(
        organization_id=user.organization_id,
        org_unit_id=body.org_unit_id,
        act_type_id=body.act_type_id,
        title=body.title.strip(),
        summary=body.summary.strip() if body.summary else None,
        content_html=body.content_html,
        content_json=body.content_json,
        plain_text=plain_text,
        status=MatterStatus.DRAFT,
        author_id=user.id,
    )
    db.add(matter)
    await db.commit()
    await db.refresh(matter)

    info = await capture_request_info(request)
    await log_audit_event(
        db=db,
        action=AuditAction.MATTER_CREATED,
        user_id=user.id,
        organization_id=user.organization_id,
        entity_type="matter",
        entity_id=matter.id,
        description=f"Matter '{matter.title}' created",
        ip_address=info["ip_address"],
    )

    return await _matter_to_response(matter)


@router.get("/matters", response_model=list[MatterListResponse])
async def list_matters(
    status: Optional[str] = None,
    act_type_id: Optional[uuid.UUID] = None,
    org_unit_id: Optional[uuid.UUID] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Matter)
    user_roles = {ur.role.name for ur in user.user_roles}

    if "ADMIN" not in user_roles and "AUDITOR" not in user_roles:
        if "AUTOR" in user_roles:
            query = query.where(Matter.author_id == user.id)
        elif "REVISOR" in user_roles:
            query = query.where(Matter.status.in_([MatterStatus.REVIEW, MatterStatus.DRAFT]))
        elif "DIAGRAMADOR" in user_roles:
            query = query.where(Matter.status == MatterStatus.APPROVED)
        else:
            query = query.where(Matter.author_id == user.id)

    if status:
        query = query.where(Matter.status == MatterStatus(status))
    if act_type_id:
        query = query.where(Matter.act_type_id == act_type_id)
    if org_unit_id:
        query = query.where(Matter.org_unit_id == org_unit_id)
    if search:
        like = f"%{search}%"
        query = query.where(
            Matter.title.ilike(like)
            | Matter.plain_text.ilike(like)
            | Matter.summary.ilike(like)
        )

    query = query.order_by(Matter.updated_at.desc())
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    matters = result.scalars().all()

    out = []
    for m in matters:
        out.append(MatterListResponse(
            id=m.id,
            title=m.title,
            summary=m.summary,
            act_type_id=m.act_type_id,
            org_unit_id=m.org_unit_id,
            status=m.status,
            version=m.version,
            author_id=m.author_id,
            reviewed_by=m.reviewed_by,
            created_at=m.created_at,
            updated_at=m.updated_at,
            attachment_count=len(m.attachments) if hasattr(m, "attachments") else 0,
        ))
    return out


@router.get("/matters/{matter_id}", response_model=MatterResponse)
async def get_matter(
    matter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    matter = await _get_matter_or_404(matter_id, db)
    _own_matter_or_admin(matter, user)
    return await _matter_to_response(matter)


@router.patch("/matters/{matter_id}", response_model=MatterResponse)
async def update_matter(
    matter_id: uuid.UUID,
    body: MatterUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "ADMIN")),
):
    matter = await _get_matter_or_404(matter_id, db)
    _own_matter_or_admin(matter, user)

    if not matter.can_edit():
        raise HTTPException(
            status_code=422,
            detail=f"Cannot edit matter in status '{matter.status.value}'",
        )

    if body.title is not None:
        matter.title = body.title.strip()
    if body.summary is not None:
        matter.summary = body.summary.strip() if body.summary else None
    if body.act_type_id is not None:
        await _entity_exists_or_404(
            ActType, body.act_type_id, db, "ActType"
        )
        matter.act_type_id = body.act_type_id
    if body.org_unit_id is not None:
        await _entity_exists_or_404(
            OrgUnit, body.org_unit_id, db, "OrgUnit"
        )
        matter.org_unit_id = body.org_unit_id
    if body.content_html is not None:
        matter.content_html = body.content_html
        matter.plain_text = extract_plain_text(body.content_html)
    if body.content_json is not None:
        matter.content_json = body.content_json

    matter.version += 1
    await db.commit()
    await db.refresh(matter)

    info = await capture_request_info(request)
    await log_audit_event(
        db=db,
        action=AuditAction.MATTER_UPDATED,
        user_id=user.id,
        organization_id=user.organization_id,
        entity_type="matter",
        entity_id=matter.id,
        description=f"Matter '{matter.title}' updated",
        ip_address=info["ip_address"],
    )

    return await _matter_to_response(matter)


# ── Status Transitions ───────────────────────────────────────────────────────


@router.post(
    "/matters/{matter_id}/submit-review",
    response_model=MatterResponse,
)
async def submit_for_review(
    matter_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "REVISOR", "ADMIN")),
):
    matter = await _get_matter_or_404(matter_id, db)
    _own_matter_or_admin(matter, user)
    matter.change_status(MatterStatus.REVIEW)
    await db.commit()
    await db.refresh(matter)

    info = await capture_request_info(request)
    await log_audit_event(
        db=db,
        action=AuditAction.MATTER_STATUS_CHANGED,
        user_id=user.id,
        organization_id=user.organization_id,
        entity_type="matter",
        entity_id=matter.id,
        description=f"Matter '{matter.title}' submitted for review",
        extra_metadata={"from": "draft", "to": "review"},
        ip_address=info["ip_address"],
    )
    return await _matter_to_response(matter)


@router.post(
    "/matters/{matter_id}/approve",
    response_model=MatterResponse,
)
async def approve_matter(
    matter_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("REVISOR", "ADMIN")),
):
    matter = await _get_matter_or_404(matter_id, db)
    matter.change_status(MatterStatus.APPROVED)
    matter.reviewed_by = user.id
    await db.commit()
    await db.refresh(matter)

    info = await capture_request_info(request)
    await log_audit_event(
        db=db,
        action=AuditAction.MATTER_STATUS_CHANGED,
        user_id=user.id,
        organization_id=user.organization_id,
        entity_type="matter",
        entity_id=matter.id,
        description=f"Matter '{matter.title}' approved",
        extra_metadata={"from": "review", "to": "approved"},
        ip_address=info["ip_address"],
    )
    return await _matter_to_response(matter)


@router.post(
    "/matters/{matter_id}/reject",
    response_model=MatterResponse,
)
async def reject_matter(
    matter_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("REVISOR", "ADMIN")),
):
    matter = await _get_matter_or_404(matter_id, db)
    matter.change_status(MatterStatus.REJECTED)
    matter.reviewed_by = user.id
    await db.commit()
    await db.refresh(matter)

    info = await capture_request_info(request)
    await log_audit_event(
        db=db,
        action=AuditAction.MATTER_STATUS_CHANGED,
        user_id=user.id,
        organization_id=user.organization_id,
        entity_type="matter",
        entity_id=matter.id,
        description=f"Matter '{matter.title}' rejected",
        extra_metadata={"from": "review", "to": "rejected"},
        ip_address=info["ip_address"],
    )
    return await _matter_to_response(matter)


@router.post(
    "/matters/{matter_id}/archive",
    response_model=MatterResponse,
)
async def archive_matter(
    matter_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "REVISOR", "ADMIN")),
):
    matter = await _get_matter_or_404(matter_id, db)
    matter.change_status(MatterStatus.ARCHIVED)
    await db.commit()
    await db.refresh(matter)

    info = await capture_request_info(request)
    await log_audit_event(
        db=db,
        action=AuditAction.MATTER_STATUS_CHANGED,
        user_id=user.id,
        organization_id=user.organization_id,
        entity_type="matter",
        entity_id=matter.id,
        description=f"Matter '{matter.title}' archived",
        extra_metadata={"to": "archived"},
        ip_address=info["ip_address"],
    )
    return await _matter_to_response(matter)


@router.delete("/matters/{matter_id}", status_code=204)
async def delete_matter(
    matter_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "ADMIN")),
):
    matter = await _get_matter_or_404(matter_id, db)
    _own_matter_or_admin(matter, user)

    if matter.status not in (MatterStatus.DRAFT, MatterStatus.ARCHIVED):
        raise HTTPException(
            status_code=422,
            detail="Only draft or archived matters can be deleted",
        )

    title = matter.title
    status = matter.status.value if isinstance(matter.status, MatterStatus) else matter.status
    info = await capture_request_info(request)
    await db.delete(matter)
    await log_audit_event(
        db=db,
        action=AuditAction.MATTER_UPDATED,
        user_id=user.id,
        organization_id=user.organization_id,
        entity_type="matter",
        entity_id=matter_id,
        description=f"Matter '{title}' deleted",
        extra_metadata={"from": status, "deleted": True},
        ip_address=info["ip_address"],
    )
    return None


# ── Content PDF Upload ──────────────────────────────────────────────────────


@router.post("/matters/{matter_id}/content-pdf")
async def upload_content_pdf(
    matter_id: uuid.UUID,
    file: UploadFile,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "ADMIN")),
):
    """Upload a PDF to be used as the matter content (instead of typed HTML).

    Each page of the PDF is converted to a PNG image and embedded via <img>
    tags in the matter's content_html.
    """
    matter = await _get_matter_or_404(matter_id, db)
    _own_matter_or_admin(matter, user)

    if not matter.can_edit():
        raise HTTPException(422, "Cannot change content of a non-editable matter")

    if not file.content_type or file.content_type != "application/pdf":
        raise HTTPException(400, "Only PDF files are accepted")

    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty file")

    from app.services.pdf_content import pdf_to_content_html

    html = pdf_to_content_html(content, str(matter.id))
    html = html.replace(
        "http://localhost:8001/api/v1/matter-content/",
        "http://api:8000/api/v1/matter-content/"
    )
    matter.content_html = html
    matter.content_json = None
    matter.plain_text = f"[Conteúdo gerado a partir de PDF: {file.filename}]"

    from app.core.html_sanitizer import extract_plain_text

    plain = extract_plain_text(html)
    if plain:
        matter.plain_text = plain

    await db.commit()
    await db.refresh(matter)

    return MatterResponse.model_validate(matter)


@router.get("/matter-content/{matter_id}/{filename}")
async def serve_matter_content_image(
    matter_id: uuid.UUID,
    filename: str,
):
    """Serve a content image from a PDF converted matter."""
    from pathlib import Path
    from app.core.config import settings

    filepath = Path(settings.UPLOAD_DIR).resolve() / "matter-content" / str(matter_id) / filename
    if not filepath.is_file():
        raise HTTPException(404, "Image not found")
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "png"
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg"}.get(ext, "image/png")
    return FileResponse(str(filepath), media_type=mime)


# ── Attachments ──────────────────────────────────────────────────────────────


@router.post(
    "/matters/{matter_id}/attachments",
    response_model=AttachmentOut,
    status_code=201,
)
async def add_attachment(
    matter_id: uuid.UUID,
    file: UploadFile,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "ADMIN")),
):
    matter = await _get_matter_or_404(matter_id, db)
    _own_matter_or_admin(matter, user)

    if not matter.can_edit():
        raise HTTPException(
            status_code=422,
            detail="Cannot add attachments to a non-editable matter",
        )

    # For now, only create a placeholder attachment
    # Full file storage will use MinIO
    content = await file.read()
    import hashlib
    file_hash = hashlib.sha256(content).hexdigest()

    f = File(
        organization_id=user.organization_id,
        filename=file.filename or "unnamed",
        mime_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        storage_path=f"attachments/{matter.id}/{file.filename}",
        storage_bucket="doe-temp",
        hash=file_hash,
        uploaded_by=user.id,
        is_temp=True,
    )
    db.add(f)
    await db.flush()

    att = MatterAttachment(
        matter_id=matter.id,
        file_id=f.id,
        type="other",
        title=file.filename,
        position=0,
    )
    db.add(att)
    await db.commit()
    await db.refresh(att)

    return AttachmentOut(
        id=att.id,
        file_id=att.file_id,
        title=att.title,
        type=att.type,
        position=att.position,
    )


@router.get(
    "/matters/{matter_id}/audit",
    response_model=list[dict],
)
async def list_matter_audit(
    matter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.models.audit_event import AuditEvent
    result = await db.execute(
        select(AuditEvent)
        .where(AuditEvent.entity_id == matter_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(50)
    )
    events = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "action": e.action,
            "description": e.description,
            "extra_metadata": e.extra_metadata,
            "created_at": e.created_at.isoformat(),
        }
        for e in events
    ]


@router.delete(
    "/matters/{matter_id}/attachments/{attachment_id}",
    response_model=MessageResponse,
)
async def remove_attachment(
    matter_id: uuid.UUID,
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "ADMIN")),
):
    matter = await _get_matter_or_404(matter_id, db)
    _own_matter_or_admin(matter, user)

    if not matter.can_edit():
        raise HTTPException(
            status_code=422,
            detail="Cannot remove attachments from a non-editable matter",
        )

    result = await db.execute(
        select(MatterAttachment).where(
            MatterAttachment.id == attachment_id,
            MatterAttachment.matter_id == matter_id,
        )
    )
    att = result.scalar_one_or_none()
    if att is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    await db.delete(att)
    await db.commit()

    return MessageResponse(message="Attachment removed")


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _matter_to_response(matter: Matter) -> MatterResponse:
    attachments = [
        AttachmentOut(
            id=a.id,
            file_id=a.file_id,
            title=a.title,
            type=a.type,
            position=a.position,
        )
        for a in (matter.attachments or [])
    ]
    return MatterResponse(
        id=matter.id,
        title=matter.title,
        summary=matter.summary,
        act_type_id=matter.act_type_id,
        org_unit_id=matter.org_unit_id,
        content_html=matter.content_html,
        content_json=matter.content_json,
        plain_text=matter.plain_text,
        status=matter.status,
        version=matter.version,
        author_id=matter.author_id,
        reviewed_by=matter.reviewed_by,
        published_at=matter.published_at,
        is_erratum=matter.is_erratum,
        created_at=matter.created_at,
        updated_at=matter.updated_at,
        attachments=attachments,
    )
