import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.act_type_config import (
    config_flag,
    validate_dynamic_values,
)
from app.core.auth import get_current_user, require_roles
from app.core.content_mode import MODE_SEMANTIC, normalize_mode
from app.core.database import get_db
from app.core.file_validator import validate_upload
from app.core.html_sanitizer import extract_plain_text
from app.core.versioning import current_etag, require_no_conflict
from app.middleware.audit import capture_request_info, log_audit_event
from app.models.act_type import ActType
from app.models.authority import Authority
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
    MatterReviewDecision,
    MatterUpdate,
    MessageResponse,
)

router = APIRouter(tags=["matters"])

TITLE_NUMBER_RE = re.compile(r"(?:^|\D)(\d+)(?:/\d+)?$")


def _structured_detail(errors: list[dict]) -> list[dict]:
    """Normalize field-level validation errors into the API 422 payload."""
    return [
        {"field": e.get("field", "_"), "message": e.get("message", "Invalid"), "code": "field_error"}
        for e in errors
    ]


def _check_required_fields(
    act_type: ActType,
    *,
    number: str | None,
    year: int | None,
    act_date,
    responsible_present: bool,
    metadata: dict | None,
) -> list[dict]:
    """Enforce per-act-type required rules (numbers/year/date/responsible/dynamic).

    Returns a list of field errors; empty means OK.
    """
    config = act_type.config or {}
    errors: list[dict] = []
    if config_flag(config, "number_required") and (number is None or not str(number).strip()):
        errors.append({"field": "act_number", "message": "Número do ato é obrigatório para este tipo."})
    if config_flag(config, "year_required") and year is None:
        errors.append({"field": "act_year", "message": "Ano do ato é obrigatório para este tipo."})
    if config_flag(config, "date_required") and act_date is None:
        errors.append({"field": "act_date", "message": "Data do ato é obrigatória para este tipo."})
    if config_flag(config, "responsible_required") and not responsible_present:
        errors.append({"field": "responsible", "message": "Responsável pelo ato é obrigatório para este tipo."})
    errors.extend(validate_dynamic_values(config, metadata))
    return errors


async def _load_act_type(db: AsyncSession, act_type_id: uuid.UUID) -> ActType:
    result = await db.execute(select(ActType).where(ActType.id == act_type_id))
    act_type = result.scalar_one_or_none()
    if act_type is None:
        raise HTTPException(status_code=404, detail="ActType not found")
    return act_type


async def _resolve_responsible(
    db: AsyncSession,
    user: User,
    *,
    responsible_id: uuid.UUID | None,
    responsible_name: str | None,
    responsible_role: str | None,
    creating: bool,
) -> tuple[str | None, str | None, uuid.UUID | None]:
    """Resolve the responsible authority + frozen name/role snapshot.

    When ``responsible_id`` is given, name/role are copied from the Authority
    registry (the frozen snapshot lives on the Matter's own columns). When not
    given, legacy free text is honoured. Returns ``(name, role, responsible_id)``.
    """
    if responsible_id is not None:
        result = await db.execute(
            select(Authority).where(
                Authority.id == responsible_id,
                Authority.organization_id == user.organization_id,
            )
        )
        authority = result.scalar_one_or_none()
        if authority is None:
            raise HTTPException(
                status_code=404, detail="Responsible authority not found"
            )
        if creating and not authority.is_active:
            raise HTTPException(
                status_code=422,
                detail="Cannot assign an inactive authority to a new matter",
            )
        # Freeze the current registry values onto the matter snapshot.
        return (
            authority.name,
            authority.role,
            authority.id,
        )
    # Free text (legacy or when no authority selected). Trim empties.
    name = responsible_name.strip() if responsible_name and responsible_name.strip() else None
    role = responsible_role.strip() if responsible_role and responsible_role.strip() else None
    return name, role, None


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
    act_type = await _load_act_type(db, act_type_id)

    matter_result = await db.execute(
        select(Matter.act_number, Matter.act_year, Matter.title).where(
            Matter.organization_id == user.organization_id,
            Matter.act_type_id == act_type_id,
            Matter.status.in_([MatterStatus.APPROVED, MatterStatus.PUBLISHED]),
        )
    )

    last_number = 0
    number_width = 2
    # Prefer structured act_number when available; fall back to title parsing
    # only for legacy matters that never had structured metadata.
    for act_number, act_year, title in matter_result.all():
        value: int | None = None
        digits = ""
        if act_number and act_number.strip().isdigit():
            value = int(act_number)
            digits = act_number.strip()
        else:
            match = TITLE_NUMBER_RE.search(title or "")
            if match:
                value = int(match.group(1))
                digits = match.group(1)
        if value is not None and value > last_number:
            last_number = value
            number_width = max(2, len(digits))

    next_number = last_number + 1
    import datetime
    year = datetime.date.today().year

    # Title: honour a configured title_pattern when present, else the default.
    from app.core.act_type_config import format_act_title
    config = act_type.config or {}
    title = None
    if config.get("title_pattern"):
        title = format_act_title(
            config.get("title_pattern"),
            type_name=act_type.name,
            number=next_number,
            year=year,
            act_date=datetime.date.today(),
        )
    if not title:
        prefix = act_type.name.upper()
        title = f"{prefix} Nº {next_number:0{number_width}d}/{year}"

    return MatterNextTitleResponse(
        title=title,
        next_number=next_number,
        last_number=last_number,
        year=year,
        advisory=True,
        reserved=False,
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
    if body.publication_type not in ("normal", "rectification", "republication"):
        raise HTTPException(422, "Invalid publication_type")
    if body.publication_type in ("rectification", "republication"):
        if not body.references_matter_id:
            raise HTTPException(
                422,
                "Rectification/republication requires references_matter_id "
                "(the original published matter)",
            )
        ref_result = await db.execute(
            select(Matter).where(
                Matter.id == body.references_matter_id,
                Matter.organization_id == user.organization_id,
            )
        )
        if ref_result.scalar_one_or_none() is None:
            raise HTTPException(404, "Referenced matter not found")

    plain_text = extract_plain_text(body.content_html)
    act_type = await _load_act_type(db, body.act_type_id)

    # Required per-type rules + dynamic field values are validated server-side.
    responsible_name, responsible_role, responsible_id = await _resolve_responsible(
        db, user,
        responsible_id=body.responsible_id,
        responsible_name=body.responsible_name,
        responsible_role=body.responsible_role,
        creating=True,
    )
    metadata = body.metadata or {}
    if not isinstance(metadata, dict):
        metadata = {}
    req_errors = _check_required_fields(
        act_type,
        number=body.act_number,
        year=body.act_year,
        act_date=body.act_date,
        responsible_present=bool(responsible_name or responsible_id),
        metadata=metadata,
    )
    if req_errors:
        raise HTTPException(status_code=422, detail=_structured_detail(req_errors))

    matter = Matter(
        organization_id=user.organization_id,
        org_unit_id=body.org_unit_id,
        act_type_id=body.act_type_id,
        title=body.title.strip(),
        summary=body.summary.strip() if body.summary else None,
        content_html=body.content_html,
        content_json=body.content_json,
        content_mode=body.content_mode or "rich_text",
        plain_text=plain_text,
        status=MatterStatus.DRAFT,
        author_id=user.id,
        act_number=body.act_number.strip() if body.act_number else None,
        act_year=body.act_year,
        act_date=body.act_date,
        responsible_name=responsible_name,
        responsible_role=responsible_role,
        responsible_id=responsible_id,
        metadata_json=metadata,
        publication_type=body.publication_type or "normal",
        references_matter_id=body.references_matter_id,
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
    query = select(Matter).where(Matter.organization_id == user.organization_id)
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
            act_number=m.act_number,
            act_year=m.act_year,
            created_at=m.created_at,
            updated_at=m.updated_at,
            attachment_count=len(m.attachments) if hasattr(m, "attachments") else 0,
        ))
    return out


@router.get("/matters/stats")
async def matter_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Contagens de matérias por estado para os cards do painel (escopo da organização)."""
    query = select(Matter.status, func.count()).where(Matter.organization_id == user.organization_id)
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

    query = query.group_by(Matter.status)
    result = await db.execute(query)

    counts = {status: 0 for status in MatterStatus}
    for status, count in result.all():
        counts[status] = count

    total = sum(counts.values())
    return {
        "total": total,
        "published": counts[MatterStatus.PUBLISHED],
        "draft": counts[MatterStatus.DRAFT],
        "review": counts[MatterStatus.REVIEW],
        "approved": counts[MatterStatus.APPROVED],
        "archived": counts[MatterStatus.ARCHIVED],
        "rejected": counts[MatterStatus.REJECTED],
    }


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
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "ADMIN")),
):
    matter = await _get_matter_or_404(matter_id, db)
    _own_matter_or_admin(matter, user)

    # Fase 2 — conflito de versão: nunca "última gravação vence" silenciosamente.
    require_no_conflict(request, matter)

    if not matter.can_edit():
        # status vem do banco como str (coluna String, sem type decorator).
        current = getattr(matter.status, "value", matter.status)
        raise HTTPException(
            status_code=422,
            detail=f"Cannot edit matter in status '{current}'",
        )

    # Fase 2 — uma única fonte canônica. Se a matéria é SEMÂNTICA, o editor HTML
    # legado não pode gravar um conteúdo HTML divergente sem trocar explicitamente
    # de modo. A troca exige um campo dedicado (e gera nova versão de modo).
    current_mode = normalize_mode(getattr(matter, "content_mode", None))
    body_writes_html = body.content_html is not None or body.content_json is not None
    if current_mode == MODE_SEMANTIC and body_writes_html:
        requested_mode = normalize_mode(body.content_mode)
        if requested_mode == MODE_SEMANTIC:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Matéria em modo semântico: o conteúdo canônico é o "
                    "documento semântico. Use o editor semântico; não é possível "
                    "gravar HTML divergente aqui."
                ),
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
    if body.content_mode is not None:
        matter.content_mode = normalize_mode(body.content_mode)
    if body.act_number is not None:
        matter.act_number = body.act_number.strip() or None
    if body.act_year is not None:
        matter.act_year = body.act_year
    if body.act_date is not None:
        matter.act_date = body.act_date
    if body.responsible_name is not None:
        matter.responsible_name = body.responsible_name.strip() or None
    if body.responsible_role is not None:
        matter.responsible_role = body.responsible_role.strip() or None
    if body.responsible_id is not None:
        name, role, rid = await _resolve_responsible(
            db, user,
            responsible_id=body.responsible_id,
            responsible_name=body.responsible_name,
            responsible_role=body.responsible_role,
            creating=False,
        )
        matter.responsible_name = name
        matter.responsible_role = role
        matter.responsible_id = rid
    if body.metadata is not None:
        if not isinstance(body.metadata, dict):
            raise HTTPException(status_code=422, detail="metadata must be an object")
        # When the act type changed (or is being changed), validate the provided
        # dynamic values against the *effective* type so only valid values are kept.
        effective_type_id = body.act_type_id or matter.act_type_id
        effective_type = await _load_act_type(db, effective_type_id)
        value_errors = validate_dynamic_values(effective_type.config or {}, body.metadata)
        if value_errors:
            raise HTTPException(status_code=422, detail=_structured_detail(value_errors))
        matter.metadata_json = body.metadata
    if body.publication_type is not None:
        if body.publication_type not in ("normal", "rectification", "republication"):
            raise HTTPException(422, "Invalid publication_type")
        matter.publication_type = body.publication_type
    if body.references_matter_id is not None:
        ref_result = await db.execute(
            select(Matter).where(
                Matter.id == body.references_matter_id,
                Matter.organization_id == user.organization_id,
            )
        )
        if ref_result.scalar_one_or_none() is None:
            raise HTTPException(404, "Referenced matter not found")
        matter.references_matter_id = body.references_matter_id

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

    response.headers["ETag"] = current_etag(matter)
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

    # Last structured gate before approval: re-validate the per-type required
    # rules + dynamic fields so a partial draft can't be submitted incomplete.
    act_type = await _load_act_type(db, matter.act_type_id)
    req_errors = _check_required_fields(
        act_type,
        number=getattr(matter, "act_number", None),
        year=getattr(matter, "act_year", None),
        act_date=getattr(matter, "act_date", None),
        responsible_present=bool(
            getattr(matter, "responsible_name", None) or getattr(matter, "responsible_id", None)
        ),
        metadata=getattr(matter, "metadata_json", None),
    )
    if req_errors:
        raise HTTPException(status_code=422, detail=_structured_detail(req_errors))

    matter.change_status(MatterStatus.REVIEW)
    matter.review_reason = None  # cleared on (re)submission
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
    matter.review_reason = None
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
    body: MatterReviewDecision | None = None,
    request: Request = None,  # type: ignore[assignment]  # injected by FastAPI
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("REVISOR", "ADMIN")),
):
    matter = await _get_matter_or_404(matter_id, db)
    reason = (body.reason if body else None)
    if reason is not None:
        reason = reason.strip()
    if not reason:
        raise HTTPException(
            status_code=422,
            detail="A reason is required to return a matter for correction",
        )
    matter.change_status(MatterStatus.REJECTED)
    matter.reviewed_by = user.id
    matter.review_reason = reason
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
        description=f"Matter '{matter.title}' returned for correction",
        extra_metadata={"from": "review", "to": "rejected", "reason": reason},
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
    matter.content_mode = "pdf"
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
    """Serve a content image from a PDF converted matter.

    Unauthenticated by design: browsers load <img> tags without an
    Authorization header, and matter_id is an unguessable UUID — same
    trust model as the public edition PDF downloads.
    """
    import re
    from pathlib import Path

    from app.core.config import settings

    if not re.fullmatch(r"[\w\-.]+", filename):
        raise HTTPException(400, "Invalid filename")
    base = Path(settings.UPLOAD_DIR).resolve()
    filepath = (base / "matter-content" / str(matter_id) / filename).resolve()
    if not str(filepath).startswith(str(base)):
        raise HTTPException(403, "Path traversal denied")
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

    ext, content = await validate_upload(file)

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
        content_mode=matter.content_mode,
        plain_text=matter.plain_text,
        status=matter.status,
        version=matter.version,
        author_id=matter.author_id,
        reviewed_by=matter.reviewed_by,
        published_at=matter.published_at,
        is_erratum=matter.is_erratum,
        act_number=matter.act_number,
        act_year=matter.act_year,
        act_date=matter.act_date,
        responsible_name=matter.responsible_name,
        responsible_role=matter.responsible_role,
        responsible_id=matter.responsible_id,
        metadata=matter.metadata_json,
        review_reason=matter.review_reason,
        publication_type=matter.publication_type or "normal",
        references_matter_id=matter.references_matter_id,
        created_at=matter.created_at,
        updated_at=matter.updated_at,
        attachments=attachments,
    )
