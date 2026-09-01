"""Admin API for the semantic document engine and templates (feature-flagged)."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.core.feature_flags import is_feature_enabled
from app.middleware.audit import capture_request_info, log_audit_event
from app.models.enums import AuditAction
from app.models.matter import Matter
from app.models.publication_template import PublicationTemplate
from app.models.publication_template_version import PublicationTemplateVersion
from app.models.user import User
from app.schemas.semantic import (
    SemanticAnalyzeRequest,
    SemanticAnalyzeResponse,
    SemanticSaveRequest,
    TemplateActivateRequest,
    TemplateCreateRequest,
    TemplateOut,
    TemplateVersionCreateRequest,
    TemplateVersionOut,
)
from app.semantic import parser
from app.semantic.integrity import compute_text_integrity
from app.semantic.schemas import (
    CLASSIFICATION_CONFIRMED,
    SemanticDocument,
)
from app.semantic.templates import (
    TEMPLATE_STATUS_ACTIVE,
    TEMPLATE_STATUS_DRAFT,
    default_config_for,
    template_slugs,
)
from app.semantic.validator import (
    confirm_document,
    validate_document,
)

router = APIRouter(tags=["semantic"])


async def _require_engine(db: AsyncSession, user: User) -> None:
    if not await is_feature_enabled(db, "semantic_document_engine_enabled",
                                     user.organization_id):
        raise HTTPException(403, "Motor semântico desabilitado")


async def _get_matter_or_404(matter_id: uuid.UUID, db: AsyncSession) -> Matter:
    result = await db.execute(select(Matter).where(Matter.id == matter_id))
    matter = result.scalar_one_or_none()
    if matter is None:
        raise HTTPException(404, "Matter not found")
    return matter


def _own_matter_or_admin(matter: Matter, user: User) -> None:
    roles = {ur.role.name for ur in user.user_roles}
    if "ADMIN" in roles:
        return
    if matter.author_id != user.id:
        raise HTTPException(403, "Acesso somente às suas matérias")


# ── Semantic analysis / save ────────────────────────────────────────────────


@router.post(
    "/matters/{matter_id}/semantic/analyze",
    response_model=SemanticAnalyzeResponse,
)
async def analyze_matter_semantics(
    matter_id: uuid.UUID,
    body: SemanticAnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "ADMIN")),
):
    await _require_engine(db, user)
    matter = await _get_matter_or_404(matter_id, db)
    _own_matter_or_admin(matter, user)

    document = parser.parse_document(
        html=body.html,
        plain=body.plain,
        title=body.title,
        summary=body.summary,
        document_type=body.document_type,
    )
    validation = validate_document(document, require_confirmed=False)
    source_rep = body.plain or document.plain_text()
    integrity = compute_text_integrity(source_rep, document)
    return SemanticAnalyzeResponse(
        document=document,
        source_hash=document.source_hash or "",
        text_integrity_hash=document.text_integrity_hash or "",
        integrity=integrity,
        validation=validation,
    )


@router.put("/matters/{matter_id}/semantic", response_model=dict)
async def save_matter_semantics(
    matter_id: uuid.UUID,
    body: SemanticSaveRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("AUTOR", "ADMIN")),
):
    await _require_engine(db, user)
    matter = await _get_matter_or_404(matter_id, db)
    _own_matter_or_admin(matter, user)
    if not matter.can_edit():
        raise HTTPException(422, "Matéria não editável neste status")

    doc = body.document
    if body.confirm_all:
        confirm_document(doc)

    validation = validate_document(doc)
    if not validation["valid"]:
        raise HTTPException(422, {"message": "Documento inválido", "errors": validation["errors"]})

    doc.updated_at = None  # timestamp managed by model
    doc_json = doc.model_dump(mode="json")

    matter.semantic_content = doc_json
    matter.semantic_schema_version = doc.schema_version
    matter.source_hash = doc.source_hash
    matter.text_integrity_hash = doc.text_integrity_hash
    matter.classification_status = doc.classification_status or CLASSIFICATION_CONFIRMED
    matter.template_id = body.template_id
    matter.template_version = body.template_version
    await db.commit()

    info = await capture_request_info(request)
    await log_audit_event(
        db=db, action=AuditAction.MATTER_UPDATED,
        user_id=user.id, organization_id=user.organization_id,
        entity_type="matter", entity_id=matter.id,
        description=f"Conteúdo semântico salvo para '{matter.title}'",
        ip_address=info["ip_address"],
    )
    return {
        "document": doc_json,
        "text_integrity_hash": doc.text_integrity_hash,
        "classification_status": doc.classification_status,
        "validation": validation,
    }


@router.get("/matters/{matter_id}/semantic", response_model=dict)
async def get_matter_semantics(
    matter_id: uuid.UUID,
    media: str = "screen",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_engine(db, user)
    matter = await _get_matter_or_404(matter_id, db)
    _own_matter_or_admin(matter, user)
    if not matter.semantic_content:
        raise HTTPException(404, "Matéria sem conteúdo semântico")
    doc = SemanticDocument.model_validate(matter.semantic_content)
    return {
        "document": doc.model_dump(mode="json"),
        "classification_status": matter.classification_status,
        "template_id": str(matter.template_id) if matter.template_id else None,
        "template_version": matter.template_version,
    }


# ── Template management (template_builder_enabled) ──────────────────────────


async def _require_builder(db: AsyncSession, user: User) -> None:
    if not await is_feature_enabled(db, "template_builder_enabled",
                                     user.organization_id):
        raise HTTPException(403, "Construtor de modelos desabilitado")


def _template_to_out(t) -> TemplateOut:
    return TemplateOut(
        id=t.id,
        name=t.name,
        slug=t.slug,
        document_type=t.document_type,
        is_default=t.is_default,
        status=t.status,
        active_version=t.active_version,
        created_by=t.created_by,
        created_at=t.created_at,
        updated_at=t.updated_at,
        versions=[
            TemplateVersionOut(
                id=v.id, version_number=v.version_number, status=v.status,
                config_hash=v.config_hash, change_reason=v.change_reason,
                created_by=v.created_by, created_at=v.created_at,
            )
            for v in sorted(t.versions or [], key=lambda x: x.version_number)
        ],
    )


@router.get("/templates", response_model=list[TemplateOut])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "DIAGRAMADOR")),
):
    result = await db.execute(
        select(PublicationTemplate)
        .where(PublicationTemplate.organization_id == user.organization_id)
        .options(selectinload(PublicationTemplate.versions))
    )
    return [_template_to_out(t) for t in result.scalars().all()]


@router.post("/templates", response_model=TemplateOut, status_code=201)
async def create_template(
    body: TemplateCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "DIAGRAMADOR")),
):
    await _require_builder(db, user)
    if body.slug not in template_slugs() and not _is_custom_slug(body.slug):
        raise HTTPException(422, "Slug de modelo desconhecido")

    existing = await db.execute(
        select(PublicationTemplate).where(
            PublicationTemplate.organization_id == user.organization_id,
            PublicationTemplate.slug == body.slug,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Modelo já existe para esta organização")

    t = PublicationTemplate(
        organization_id=user.organization_id,
        name=body.name,
        slug=body.slug,
        document_type=body.document_type,
        status=TEMPLATE_STATUS_DRAFT,
        created_by=user.id,
    )
    db.add(t)
    await db.flush()

    config = default_config_for(body.slug)
    version = PublicationTemplateVersion(
        template_id=t.id,
        version_number=1,
        status=TEMPLATE_STATUS_DRAFT,
        config_json=config.model_dump(mode="json"),
        config_hash=config.config_hash(),
        change_reason="Versão inicial",
        created_by=user.id,
    )
    db.add(version)
    await db.commit()

    info = await capture_request_info(request)
    await log_audit_event(
        db=db, action=AuditAction.MATTER_UPDATED,
        user_id=user.id, organization_id=user.organization_id,
        entity_type="template", entity_id=t.id,
        description=f"Modelo '{body.name}' criado",
        ip_address=info["ip_address"],
    )

    result = await db.execute(
        select(PublicationTemplate)
        .where(PublicationTemplate.id == t.id)
        .options(selectinload(PublicationTemplate.versions))
    )
    return _template_to_out(result.scalar_one())


def _is_custom_slug(slug: str) -> bool:
    return bool(slug) and slug.replace("-", "").isalnum() and len(slug) <= 100


@router.post(
    "/templates/{template_id}/versions",
    response_model=TemplateOut,
)
async def create_template_version(
    template_id: uuid.UUID,
    body: TemplateVersionCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "DIAGRAMADOR")),
):
    await _require_builder(db, user)
    result = await db.execute(
        select(PublicationTemplate)
        .where(
            PublicationTemplate.id == template_id,
            PublicationTemplate.organization_id == user.organization_id,
        )
        .options(selectinload(PublicationTemplate.versions))
    )
    t = result.scalar_one_or_none()
    if t is None:
        raise HTTPException(404, "Modelo não encontrado")

    from app.semantic.templates import TemplateConfig

    try:
        config = TemplateConfig.model_validate(body.config)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, f"Configuração inválida: {exc}")

    next_number = (max((v.version_number for v in t.versions or []), default=0) or 0) + 1
    version = PublicationTemplateVersion(
        template_id=t.id,
        version_number=next_number,
        status=TEMPLATE_STATUS_DRAFT,
        config_json=config.model_dump(mode="json"),
        config_hash=config.config_hash(),
        change_reason=body.change_reason,
        created_by=user.id,
    )
    db.add(version)
    await db.commit()

    info = await capture_request_info(request)
    await log_audit_event(
        db=db, action=AuditAction.MATTER_UPDATED,
        user_id=user.id, organization_id=user.organization_id,
        entity_type="template", entity_id=t.id,
        description=f"Nova versão v{next_number} do modelo '{t.name}'",
        ip_address=info["ip_address"],
    )
    result = await db.execute(
        select(PublicationTemplate)
        .where(PublicationTemplate.id == t.id)
        .options(selectinload(PublicationTemplate.versions))
    )
    return _template_to_out(result.scalar_one())


@router.post(
    "/templates/{template_id}/activate",
    response_model=TemplateOut,
)
async def activate_template_version(
    template_id: uuid.UUID,
    body: TemplateActivateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "DIAGRAMADOR")),
):
    await _require_builder(db, user)
    result = await db.execute(
        select(PublicationTemplate)
        .where(
            PublicationTemplate.id == template_id,
            PublicationTemplate.organization_id == user.organization_id,
        )
        .options(selectinload(PublicationTemplate.versions))
    )
    t = result.scalar_one_or_none()
    if t is None:
        raise HTTPException(404, "Modelo não encontrado")

    version = next(
        (v for v in (t.versions or []) if v.version_number == body.version_number),
        None,
    )
    if version is None:
        raise HTTPException(404, "Versão não encontrada")

    version.status = TEMPLATE_STATUS_ACTIVE
    t.active_version = version.version_number
    t.status = TEMPLATE_STATUS_ACTIVE
    await db.commit()

    info = await capture_request_info(request)
    await log_audit_event(
        db=db, action=AuditAction.MATTER_UPDATED,
        user_id=user.id, organization_id=user.organization_id,
        entity_type="template", entity_id=t.id,
        description=(
            f"Versão v{version.version_number} do modelo '{t.name}' ativada"
            + (f" ({body.reason})" if body.reason else "")
        ),
        ip_address=info["ip_address"],
    )
    result = await db.execute(
        select(PublicationTemplate)
        .where(PublicationTemplate.id == t.id)
        .options(selectinload(PublicationTemplate.versions))
    )
    return _template_to_out(result.scalar_one())
