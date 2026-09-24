"""Endpoints de modelos documentais (DocumentModel) e geração por IA.

Tudo é escopado por ``user.organization_id``. Permissões:
  * leitura/preview (listar/detalhe/versões/preview): quem tiver
    ``document_model.use``, ``document_model.manage`` ou ``document_model.approve``;
  * criar modelo/versão/arquivar/submeter: ``document_model.manage``;
  * aprovar/ativar versão: ``document_model.approve``;
  * geração por IA (extração): ``document_model.use``.

Nenhum endpoint devolve segredos. Preview é determinístico (motor). A geração
por IA valida a resposta e só devolve valores de campos declarados.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.file_validator import validate_upload
from app.core.permissions import require_permission
from app.core.storage import set_storage_tenant, storage
from app.document_model import service as dm_service
from app.document_model.errors import InvalidFieldValueError, UnknownFieldError
from app.document_model.fill import validate_and_resolve
from app.document_model.generation import (
    PROMPT_VERSION,
    ModelSelectionError,
    models_for_editor_composition,
    choose_model_for_prompt,
    extract_values,
    pick_active_model,
)
from app.document_model.ingest import create_rendered_matter, semantic_to_html
from app.document_model.layout import DocumentLayout, default_layout
from app.document_model.learning import (
    LEARN_PROMPT_VERSION,
    analyze_documents,
    extract_text,
    extract_visual_profile,
)
from app.document_model.render_html import build_html, render_pdf
from app.document_model.renderer import render
from app.document_model.schemas import DocumentModelConfig
from app.middleware.audit import capture_request_info, log_audit_event
from app.models.act_type import ActType
from app.models.ai_execution import AiExecution
from app.models.audit_event import AuditEvent
from app.models.document_model import (
    DocumentModel,
    DocumentModelBlock,
    DocumentModelTrainingFile,
    DocumentModelVersion,
)
from app.models.edition import Edition
from app.models.edition_item import EditionItem
from app.models.enums import AiExecutionKind, AiExecutionStatus, AuditAction
from app.models.matter import Matter
from app.models.organization import Organization
from app.models.user import User
from app.providers.antivirus import get_virus_scanner
from app.schemas.document_model import (
    AiComposeIn,
    AiComposeOut,
    AiExtractIn,
    AiExtractOut,
    DocumentModelBlockCreateIn,
    DocumentModelBlockOut,
    DocumentModelBlockUpdateIn,
    DocumentModelCreateIn,
    DocumentModelDetailOut,
    DocumentModelDuplicateIn,
    DocumentModelHistoryEntryOut,
    DocumentModelSummaryOut,
    DocumentModelVersionCreateIn,
    DocumentModelVersionUpdateIn,
    LearnProposalOut,
    MaterialFromModelIn,
    MaterialOut,
    NumberIssueIn,
    NumberIssueOut,
    PreviewOut,
    RenderPreviewIn,
    TrainingFileOut,
    TrainingFileUpdateIn,
    VersionDetailOut,
    VersionSummaryOut,
)
from app.services import document_numbering
from app.services.ai import config_store
from app.services.ai.errors import (
    AiDisabledError,
    AiNotConfiguredError,
    DeepSeekError,
)
from app.services.pdf_utils import compute_hash

router = APIRouter(tags=["document-models"])


def _is_active_slug_conflict(exc: IntegrityError) -> bool:
    """Identify only the active organization/slug uniqueness violation."""
    current = exc.orig
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        constraint = getattr(getattr(current, "diag", None), "constraint_name", None)
        constraint = constraint or getattr(current, "constraint_name", None)
        if constraint == "uq_document_models_org_slug_active":
            return True
        current = getattr(current, "__cause__", None) or getattr(
            current, "__context__", None
        )
    message = str(exc.orig)
    return (
        "uq_document_models_org_slug_active" in message
        or "UNIQUE constraint failed: document_models.organization_id, document_models.slug"
        in message
    )

_READ_PERMS = ("document_model.use", "document_model.manage", "document_model.approve")


def _org(user: User) -> uuid.UUID:
    if not user.organization_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Escopo de organização necessário.")
    return user.organization_id


async def _model_or_404(db: AsyncSession, org_id: uuid.UUID, model_id: uuid.UUID) -> DocumentModel:
    result = await db.execute(
        select(DocumentModel).where(
            DocumentModel.id == model_id,
            DocumentModel.organization_id == org_id,
            DocumentModel.deleted_at.is_(None),
        )
    )
    model = result.scalar_one_or_none()
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modelo documental não encontrado.")
    return model


def _version_or_404(model: DocumentModel, version: int) -> DocumentModelVersion:
    for v in model.versions or []:
        if v.version_number == version:
            return v
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Versão não encontrada.")


def _summary(
    model: DocumentModel,
    *,
    usage_count: int = 0,
    created_by_name: str | None = None,
) -> DocumentModelSummaryOut:
    return DocumentModelSummaryOut(
        id=model.id,
        slug=model.slug,
        name=model.name,
        purpose=model.purpose,
        document_type=model.document_type,
        status=model.status,
        is_default=model.is_default,
        active_version=model.active_version,
        parent_model_id=model.parent_model_id,
        created_by=model.created_by,
        created_by_name=created_by_name,
        usage_count=usage_count,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


async def _usage_counts(
    db: AsyncSession, org_id: uuid.UUID, model_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    """Conta quantas minutas cada modelo já gerou (auditoria confiável)."""
    if not model_ids:
        return {}
    rows = await db.execute(
        select(AuditEvent.entity_id, func.count(AuditEvent.id))
        .where(
            AuditEvent.organization_id == org_id,
            AuditEvent.entity_type == "document_model",
            AuditEvent.action == AuditAction.DOCUMENT_MODEL_MATERIAL_CREATED,
            AuditEvent.entity_id.in_(model_ids),
        )
        .group_by(AuditEvent.entity_id)
    )
    return {row[0]: row[1] for row in rows.all() if row[0] is not None}


async def _user_names(db: AsyncSession, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not user_ids:
        return {}
    rows = await db.execute(select(User.id, User.name).where(User.id.in_(user_ids)))
    return {row[0]: row[1] for row in rows.all()}


def _version_summary(v: DocumentModelVersion) -> VersionSummaryOut:
    return VersionSummaryOut(
        version_number=v.version_number,
        status=v.status,
        config_hash=v.config_hash,
        change_reason=v.change_reason,
        created_at=v.created_at,
    )


# ── Listas / detalhe ────────────────────────────────────────────────────────


@router.get("/document-models", response_model=list[DocumentModelSummaryOut])
async def list_document_models(
    document_type: str | None = None,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(*_READ_PERMS)),
):
    org_id = _org(user)
    query = select(DocumentModel).where(
        DocumentModel.organization_id == org_id, DocumentModel.deleted_at.is_(None)
    )
    if document_type:
        query = query.where(DocumentModel.document_type == document_type)
    if status_filter:
        query = query.where(DocumentModel.status == status_filter)
    query = query.order_by(DocumentModel.document_type, DocumentModel.purpose)
    result = await db.execute(query)
    models = list(result.scalars().all())
    usage = await _usage_counts(db, org_id, [m.id for m in models])
    names = await _user_names(db, [m.created_by for m in models if m.created_by])
    return [
        _summary(m, usage_count=usage.get(m.id, 0), created_by_name=names.get(m.created_by))
        for m in models
    ]


@router.get("/document-models/materials")
async def list_document_materials(
    document_type: str | None = None,
    editorial: str | None = None,
    signature: str | None = None,
    publication: str | None = None,
    search: str | None = None,
    page: int = 1,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(*_READ_PERMS)),
):
    """Lista os atos de um tipo (gerados por modelo documental) com estados
    separados por dimensão, derivados do fluxo real.

    * editorial: estado da matéria (draft/review/approved/published/archived).
    * assinatura/publicação: derivados do vínculo a edições
      (``edition_items`` → ``editions``) — a assinatura PAdES é da edição; o
      rótulo distingue isso para não sugerir assinatura criptográfica por ato
      que não existe.
    """
    org_id = _org(user)
    page = max(1, page)
    limit = max(1, min(limit, 100))

    query = select(Matter).where(Matter.organization_id == org_id)
    if document_type:
        query = query.where(Matter.document_type == document_type)
    if editorial:
        query = query.where(Matter.status == editorial)
    if search:
        like = f"%{search}%"
        query = query.where(
            or_(
                Matter.title.ilike(like),
                Matter.plain_text.ilike(like),
                Matter.act_number.ilike(like),
            )
        )
    # Limite de trabalho razoável; filtros derivados aplicam-se em memória.
    result = await db.execute(query.order_by(Matter.created_at.desc()).limit(500))
    matters = result.scalars().all()

    editions_by_matter: dict[str, list[dict]] = {}
    if matters:
        ids = [m.id for m in matters]
        items = await db.execute(
            select(
                EditionItem.matter_id,
                EditionItem.edition_id,
                Edition.number,
                Edition.year,
                Edition.status,
            )
            .join(Edition, Edition.id == EditionItem.edition_id)
            .where(EditionItem.matter_id.in_(ids))
        )
        for row in items.all():
            editions_by_matter.setdefault(str(row[0]), []).append(
                {
                    "edition_id": str(row[1]),
                    "number": row[2],
                    "year": row[3],
                    "status": row[4],
                }
            )

    items_out = []
    for m in matters:
        eds = editions_by_matter.get(str(m.id), [])
        signed = any(e["status"] in ("signed", "published") for e in eds)
        published = any(e["status"] == "published" for e in eds) or str(m.status) == "published"
        if signature == "signed" and not signed:
            continue
        if signature == "none" and signed:
            continue
        if publication == "published" and not published:
            continue
        if publication == "not_published" and published:
            continue
        items_out.append(
            {
                "id": str(m.id),
                "title": m.title,
                "summary": m.summary,
                "document_type": m.document_type,
                "editorial_status": str(m.status),
                "signature_status": "edition_signed" if signed else "none",
                "publication_status": "published" if published else "not_published",
                "act_number": m.act_number,
                "act_year": m.act_year,
                "act_date": m.act_date.isoformat() if m.act_date else None,
                "editions": eds,
                "created_at": m.created_at,
                "updated_at": m.updated_at,
            }
        )

    total = len(items_out)
    offset = (page - 1) * limit
    return {
        "items": items_out[offset : offset + limit],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/document-models/default", response_model=DocumentModelSummaryOut)
async def get_default_for_type(
    document_type: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(*_READ_PERMS)),
):
    org_id = _org(user)
    result = await db.execute(
        select(DocumentModel).where(
            DocumentModel.organization_id == org_id,
            DocumentModel.document_type == document_type,
            DocumentModel.status == "active",
            DocumentModel.is_default.is_(True),
            DocumentModel.deleted_at.is_(None),
        )
    )
    model = result.scalar_one_or_none()
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sem modelo padrão ativo para o tipo.")
    return _summary(model)


@router.get("/document-models/{model_id}", response_model=DocumentModelDetailOut)
async def get_document_model(
    model_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(*_READ_PERMS)),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    usage = await _usage_counts(db, org_id, [model.id])
    names = await _user_names(db, [model.created_by] if model.created_by else [])
    return DocumentModelDetailOut(
        **_summary(
            model,
            usage_count=usage.get(model.id, 0),
            created_by_name=names.get(model.created_by),
        ).model_dump(),
        description=model.purpose,
        versions=[_version_summary(v) for v in model.versions or []],
    )


@router.get("/document-models/{model_id}/versions/{version}", response_model=VersionDetailOut)
async def get_version(
    model_id: uuid.UUID,
    version: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(*_READ_PERMS)),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    v = _version_or_404(model, version)
    return VersionDetailOut(
        **_version_summary(v).model_dump(),
        config=v.config_json,
        layout=v.layout_json,
    )


# ── Criação / versão / ciclo de vida ───────────────────────────────────────


def _validated_layout(layout: dict | None) -> dict | None:
    """Valida o layout visual (modelo visual) quando informado."""
    if layout is None:
        return None
    try:
        return DocumentLayout.model_validate(layout).model_dump(mode="json")
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"Layout inválido: {exc}"
        ) from exc


@router.post("/document-models", response_model=DocumentModelSummaryOut, status_code=201)
async def create_document_model(
    body: DocumentModelCreateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.manage", "document_model.create")),
):
    org_id = _org(user)
    exists = await db.execute(
        select(DocumentModel.id).where(
            DocumentModel.organization_id == org_id,
            DocumentModel.slug == body.slug,
            DocumentModel.deleted_at.is_(None),
        )
    )
    if exists.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Slug já em uso nesta organização.")
    if body.parent_model_id is not None:
        await _model_or_404(db, org_id, body.parent_model_id)
    try:
        model = await dm_service.create_model(
            db,
            organization_id=org_id,
            slug=body.slug,
            name=body.name,
            config=body.config,
            layout=_validated_layout(body.layout),
            parent_model_id=body.parent_model_id,
            created_by=user.id,
        )
    except IntegrityError as exc:
        # A consulta acima melhora a mensagem no caso normal; o índice parcial
        # continua sendo a garantia contra duas criações concorrentes.
        await db.rollback()
        if _is_active_slug_conflict(exc):
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Slug já em uso nesta organização."
            ) from exc
        raise
    await _audit(
        db,
        request,
        user,
        org_id,
        AuditAction.DOCUMENT_MODEL_CREATED,
        f"Modelo documental '{body.name}' criado (v1 rascunho).",
        model.id,
    )
    await db.commit()
    await db.refresh(model)
    return _summary(model)


@router.post(
    "/document-models/{model_id}/versions", response_model=VersionDetailOut, status_code=201
)
async def create_new_version(
    model_id: uuid.UUID,
    body: DocumentModelVersionCreateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.manage")),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    v = await dm_service.create_new_version(
        db,
        model.id,
        body.config,
        layout=_validated_layout(body.layout),
        change_reason=body.change_reason,
        created_by=user.id,
    )
    await _audit(
        db,
        request,
        user,
        org_id,
        AuditAction.DOCUMENT_MODEL_VERSIONED,
        f"Nova versão v{v.version_number} do modelo '{model.name}'.",
        model.id,
    )
    await db.commit()
    await db.refresh(v)
    return VersionDetailOut(
        version_number=v.version_number,
        status=v.status,
        config_hash=v.config_hash,
        change_reason=v.change_reason,
        created_at=v.created_at,
        config=v.config_json,
        layout=v.layout_json,
    )


@router.patch(
    "/document-models/{model_id}/versions/{version}", response_model=VersionDetailOut
)
async def update_draft_model_version(
    model_id: uuid.UUID,
    version: int,
    body: DocumentModelVersionUpdateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.manage", "document_model.edit")),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    try:
        v = await dm_service.update_draft_version(
            db,
            model.id,
            version,
            config=body.config,
            layout=_validated_layout(body.layout),
            change_reason=body.change_reason,
        )
    except dm_service.ModelTransitionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    await _audit(
        db,
        request,
        user,
        org_id,
        AuditAction.DOCUMENT_MODEL_UPDATED,
        f"Rascunho v{version} do modelo '{model.name}' atualizado.",
        model.id,
    )
    await db.commit()
    await db.refresh(v)
    return VersionDetailOut(
        **_version_summary(v).model_dump(),
        config=v.config_json,
        layout=v.layout_json,
    )


@router.post(
    "/document-models/{model_id}/versions/{version}/submit", response_model=VersionDetailOut
)
async def submit_version(
    model_id: uuid.UUID,
    version: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.manage")),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    try:
        v = await dm_service.submit_for_approval(db, model.id, version)
    except dm_service.ModelTransitionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    await _audit(
        db,
        request,
        user,
        org_id,
        AuditAction.DOCUMENT_MODEL_SUBMITTED,
        f"Modelo '{model.name}' v{version} enviado para aprovação.",
        model.id,
    )
    await db.commit()
    await db.refresh(v)
    return VersionDetailOut(
        version_number=v.version_number,
        status=v.status,
        config_hash=v.config_hash,
        change_reason=v.change_reason,
        created_at=v.created_at,
        config=v.config_json,
        layout=v.layout_json,
    )


@router.post(
    "/document-models/{model_id}/versions/{version}/approve", response_model=VersionDetailOut
)
async def approve_version(
    model_id: uuid.UUID,
    version: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.approve")),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    try:
        v = await dm_service.approve_version(db, model.id, version)
    except dm_service.ModelTransitionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    await _audit(
        db,
        request,
        user,
        org_id,
        AuditAction.DOCUMENT_MODEL_APPROVED,
        f"Modelo '{model.name}' v{version} aprovado/ativado.",
        model.id,
    )
    await db.commit()
    await db.refresh(v)
    return VersionDetailOut(
        version_number=v.version_number,
        status=v.status,
        config_hash=v.config_hash,
        change_reason=v.change_reason,
        created_at=v.created_at,
        config=v.config_json,
        layout=v.layout_json,
    )


# ── Ciclo de vida: arquivar / excluir ───────────────────────────────────────


@router.post("/document-models/{model_id}/archive", response_model=DocumentModelSummaryOut)
async def archive_document_model(
    model_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.manage")),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    await dm_service.archive_model(db, model.id)
    await _audit(
        db,
        request,
        user,
        org_id,
        AuditAction.DOCUMENT_MODEL_ARCHIVED,
        f"Modelo '{model.name}' arquivado.",
        model.id,
    )
    await db.commit()
    await db.refresh(model)
    return _summary(model)


@router.post(
    "/document-models/{model_id}/deactivate", response_model=DocumentModelSummaryOut
)
async def deactivate_document_model(
    model_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.manage", "document_model.activate")),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    try:
        await dm_service.deactivate_model(db, model.id)
    except dm_service.ModelTransitionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    await _audit(
        db,
        request,
        user,
        org_id,
        AuditAction.DOCUMENT_MODEL_DEACTIVATED,
        f"Modelo '{model.name}' desativado.",
        model.id,
    )
    await db.commit()
    await db.refresh(model)
    return _summary(model)


@router.post(
    "/document-models/{model_id}/reactivate", response_model=DocumentModelSummaryOut
)
async def reactivate_document_model(
    model_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.manage", "document_model.activate")),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    try:
        await dm_service.reactivate_model(db, model.id)
    except dm_service.ModelTransitionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    await _audit(
        db,
        request,
        user,
        org_id,
        AuditAction.DOCUMENT_MODEL_ACTIVATED,
        f"Modelo '{model.name}' reativado.",
        model.id,
    )
    await db.commit()
    await db.refresh(model)
    return _summary(model)


async def _unique_slug(db: AsyncSession, org_id: uuid.UUID, base: str) -> str:
    candidate = base
    attempt = 1
    while True:
        exists = await db.execute(
            select(DocumentModel.id).where(
                DocumentModel.organization_id == org_id,
                DocumentModel.slug == candidate,
                DocumentModel.deleted_at.is_(None),
            )
        )
        if exists.scalar_one_or_none() is None:
            return candidate
        attempt += 1
        candidate = f"{base[:114]}-{attempt}"


@router.post(
    "/document-models/{model_id}/duplicate",
    response_model=DocumentModelSummaryOut,
    status_code=201,
)
async def duplicate_document_model(
    model_id: uuid.UUID,
    body: DocumentModelDuplicateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.manage", "document_model.create")),
):
    org_id = _org(user)
    source = await _model_or_404(db, org_id, model_id)
    name = (body.name or f"{source.name} (cópia)").strip()
    base_slug = body.slug or f"{source.slug}-copia"
    slug = await _unique_slug(db, org_id, base_slug)
    try:
        model = await dm_service.duplicate_model(
            db,
            source.id,
            new_slug=slug,
            new_name=name,
            created_by=user.id,
        )
    except dm_service.ModelTransitionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except IntegrityError as exc:
        await db.rollback()
        if _is_active_slug_conflict(exc):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Outro modelo foi criado com este slug; tente duplicar novamente.",
            ) from exc
        raise
    await _audit(
        db,
        request,
        user,
        org_id,
        AuditAction.DOCUMENT_MODEL_CREATED,
        f"Modelo '{name}' criado a partir de '{source.name}' (duplicado).",
        model.id,
    )
    await db.commit()
    await db.refresh(model)
    return _summary(model)


@router.get(
    "/document-models/{model_id}/history",
    response_model=list[DocumentModelHistoryEntryOut],
)
async def document_model_history(
    model_id: uuid.UUID,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(*_READ_PERMS)),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    result = await db.execute(
        select(AuditEvent)
        .where(
            AuditEvent.organization_id == org_id,
            AuditEvent.entity_type == "document_model",
            AuditEvent.entity_id == model.id,
        )
        .order_by(AuditEvent.created_at.desc())
        .limit(max(1, min(limit, 200)))
    )
    events = list(result.scalars().all())
    names = await _user_names(db, [e.user_id for e in events if e.user_id])
    return [
        DocumentModelHistoryEntryOut(
            id=e.id,
            action=getattr(e.action, "value", str(e.action)),
            description=e.description,
            user_id=e.user_id,
            user_name=names.get(e.user_id),
            created_at=e.created_at,
        )
        for e in events
    ]


@router.delete("/document-models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document_model(
    model_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.manage")),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    if model.is_default:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Modelo padrão não pode ser excluído. Defina outro padrão ou arquive-o.",
        )
    used = await db.execute(
        select(AuditEvent.id)
        .where(
            AuditEvent.organization_id == org_id,
            AuditEvent.entity_type == "document_model",
            AuditEvent.entity_id == model.id,
            AuditEvent.action == AuditAction.DOCUMENT_MODEL_MATERIAL_CREATED,
        )
        .limit(1)
    )
    if used.scalar_one_or_none() is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Modelo já gerou minutas e não pode ser excluído; arquive-o.",
        )
    name = model.name
    await dm_service.soft_delete_model(db, model.id)
    await _audit(
        db,
        request,
        user,
        org_id,
        AuditAction.DOCUMENT_MODEL_DELETED,
        f"Modelo documental '{name}' excluído (soft delete).",
        model_id,
    )
    await db.commit()
    return None


# ── Biblioteca de blocos reutilizáveis ──────────────────────────────────────


def _block_out(b: DocumentModelBlock) -> DocumentModelBlockOut:
    return DocumentModelBlockOut(
        id=b.id,
        name=b.name,
        kind=b.kind,
        description=b.description,
        content_json=b.content_json or {},
        is_active=b.is_active,
        created_at=b.created_at,
        updated_at=b.updated_at,
    )


async def _block_or_404(
    db: AsyncSession, org_id: uuid.UUID, block_id: uuid.UUID
) -> DocumentModelBlock:
    result = await db.execute(
        select(DocumentModelBlock).where(
            DocumentModelBlock.id == block_id,
            DocumentModelBlock.organization_id == org_id,
            DocumentModelBlock.deleted_at.is_(None),
        )
    )
    block = result.scalar_one_or_none()
    if block is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bloco não encontrado.")
    return block


@router.get("/document-model-blocks", response_model=list[DocumentModelBlockOut])
async def list_document_model_blocks(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(*_READ_PERMS)),
):
    org_id = _org(user)
    query = select(DocumentModelBlock).where(
        DocumentModelBlock.organization_id == org_id,
        DocumentModelBlock.deleted_at.is_(None),
    )
    if not include_inactive:
        query = query.where(DocumentModelBlock.is_active.is_(True))
    query = query.order_by(DocumentModelBlock.name)
    result = await db.execute(query)
    return [_block_out(b) for b in result.scalars().all()]


@router.post("/document-model-blocks", response_model=DocumentModelBlockOut, status_code=201)
async def create_document_model_block(
    body: DocumentModelBlockCreateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.manage", "document_model.create")),
):
    org_id = _org(user)
    duplicate = await db.execute(
        select(DocumentModelBlock.id).where(
            DocumentModelBlock.organization_id == org_id,
            DocumentModelBlock.name == body.name,
            DocumentModelBlock.deleted_at.is_(None),
        )
    )
    if duplicate.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Já existe um bloco com esse nome.")
    block = DocumentModelBlock(
        organization_id=org_id,
        name=body.name,
        kind=body.kind,
        description=body.description,
        content_json=body.content_json,
        is_active=body.is_active,
        created_by=user.id,
    )
    db.add(block)
    await db.flush()
    await _audit(
        db,
        request,
        user,
        org_id,
        AuditAction.DOCUMENT_MODEL_BLOCK_CREATED,
        f"Bloco reutilizável '{block.name}' criado.",
        block.id,
    )
    await db.commit()
    await db.refresh(block)
    return _block_out(block)


@router.patch("/document-model-blocks/{block_id}", response_model=DocumentModelBlockOut)
async def update_document_model_block(
    block_id: uuid.UUID,
    body: DocumentModelBlockUpdateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.manage", "document_model.edit")),
):
    org_id = _org(user)
    block = await _block_or_404(db, org_id, block_id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        block.name = data["name"]
    if "kind" in data and data["kind"] is not None:
        block.kind = data["kind"]
    if "description" in data:
        block.description = data["description"]
    if "content_json" in data and data["content_json"] is not None:
        block.content_json = data["content_json"]
    if "is_active" in data and data["is_active"] is not None:
        block.is_active = data["is_active"]
    await db.flush()
    await _audit(
        db,
        request,
        user,
        org_id,
        AuditAction.DOCUMENT_MODEL_BLOCK_UPDATED,
        f"Bloco reutilizável '{block.name}' atualizado.",
        block.id,
    )
    await db.commit()
    await db.refresh(block)
    return _block_out(block)


@router.delete("/document-model-blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document_model_block(
    block_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.manage", "document_model.archive")),
):
    org_id = _org(user)
    block = await _block_or_404(db, org_id, block_id)
    block.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    await _audit(
        db,
        request,
        user,
        org_id,
        AuditAction.DOCUMENT_MODEL_BLOCK_DELETED,
        f"Bloco reutilizável '{block.name}' excluído.",
        block.id,
    )
    await db.commit()
    return None


# ── Preview determinístico ──────────────────────────────────────────────────


@router.post("/document-models/{model_id}/versions/{version}/preview", response_model=PreviewOut)
async def preview_version(
    model_id: uuid.UUID,
    version: int,
    body: RenderPreviewIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(*_READ_PERMS)),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    v = _version_or_404(model, version)
    config = DocumentModelConfig.model_validate(v.config_json)
    try:
        outcome = render(config, body.values)
    except UnknownFieldError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except InvalidFieldValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    return PreviewOut(
        complete=outcome.complete,
        pending=[p.as_dict() for p in outcome.fill.pending],
        document=outcome.document.model_dump(),
        canonical_text=outcome.canonical_text,
        free_text=outcome.free_text,
    )


# ── Render HTML/PDF unificado (preview idêntico ao PDF) ─────────────────────


async def _institution_dict(db: AsyncSession, org_id: uuid.UUID) -> dict | None:
    org = (
        await db.execute(select(Organization).where(Organization.id == org_id))
    ).scalar_one_or_none()
    if org is None:
        return None
    return {
        "name": org.name,
        "cnpj": org.cnpj,
        "state": org.state,
        "address_street": org.address_street,
        "address_number": org.address_number,
        "address_complement": org.address_complement,
        "address_district": org.address_district,
        "address_city": org.address_city,
        "address_postal_code": org.address_postal_code,
        "phone": org.phone,
        "email": org.email,
        "site": org.site,
        "logo_url": org.logo_url,
    }


def _layout_of(v: DocumentModelVersion) -> DocumentLayout:
    return DocumentLayout.model_validate(v.layout_json or default_layout())


@router.post("/document-models/{model_id}/versions/{version}/render")
async def render_version_html(
    model_id: uuid.UUID,
    version: int,
    body: RenderPreviewIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(*_READ_PERMS)),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    v = _version_or_404(model, version)
    config = DocumentModelConfig.model_validate(v.config_json)
    institution = await _institution_dict(db, org_id)
    try:
        rendered = build_html(config, _layout_of(v), body.values, institution)
    except UnknownFieldError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except InvalidFieldValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    return {
        "html": rendered.html,
        "complete": rendered.outcome.complete,
        "pending": [p.as_dict() for p in rendered.outcome.fill.pending],
        "canonical_text": rendered.outcome.canonical_text,
    }


@router.post("/document-models/{model_id}/versions/{version}/render-pdf")
async def render_version_pdf(
    model_id: uuid.UUID,
    version: int,
    body: RenderPreviewIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(*_READ_PERMS)),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    v = _version_or_404(model, version)
    config = DocumentModelConfig.model_validate(v.config_json)
    institution = await _institution_dict(db, org_id)
    try:
        rendered = build_html(config, _layout_of(v), body.values, institution)
    except UnknownFieldError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except InvalidFieldValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    pdf = render_pdf(rendered.html)
    filename = f"modelo-{model.slug}-v{version}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# ── Aprender com documentos (Fase 4) ────────────────────────────────────────

_TRAINING_STATUSES = {"uploaded", "analyzed", "empty", "failed", "rejected"}


def _training_out(tf: DocumentModelTrainingFile) -> TrainingFileOut:
    return TrainingFileOut(
        id=tf.id,
        filename=tf.filename,
        mime_type=tf.mime_type,
        size_bytes=tf.size_bytes,
        status=tf.status,
        used_by_ai=tf.used_by_ai,
        has_text=bool(tf.extracted_text and tf.extracted_text.strip()),
        created_at=tf.created_at,
    )


async def _training_or_404(
    db: AsyncSession, org_id: uuid.UUID, file_id: uuid.UUID
) -> DocumentModelTrainingFile:
    result = await db.execute(
        select(DocumentModelTrainingFile).where(
            DocumentModelTrainingFile.id == file_id,
            DocumentModelTrainingFile.organization_id == org_id,
            DocumentModelTrainingFile.deleted_at.is_(None),
        )
    )
    tf = result.scalar_one_or_none()
    if tf is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Documento de referência não encontrado.")
    return tf


def _ai_status_for(exc: DeepSeekError) -> str:
    code = getattr(exc, "code", "ai_provider_error")
    return {
        "api_not_configured": "not_configured",
        "ai_disabled": "disabled",
        "authentication": "authentication",
        "rate_limited": "rate_limited",
        "timeout": "timeout",
        "invalid_request": "invalid_request",
        "invalid_response": "invalid_response",
        "truncated": "truncated",
        "provider_unavailable": "unavailable",
    }.get(code, "error")


def _ai_pt_msg(exc: DeepSeekError) -> str:
    return {
        "api_not_configured": "Nenhuma chave de IA cadastrada. Configure em Configurações → IA.",
        "ai_disabled": "Os recursos de IA estão desativados para esta organização.",
        "authentication": "Falha de autenticação com a IA. Verifique a chave.",
        "rate_limited": "Limite de uso da IA atingido. Tente novamente.",
        "timeout": "A IA não respondeu a tempo. Tente novamente.",
        "invalid_request": "A IA recebeu uma requisição inválida.",
        "invalid_response": "A IA retornou uma resposta inesperada. Tente novamente.",
        "truncated": (
            "A IA atingiu o limite de tamanho antes de concluir. Tente novamente "
            "ou use um documento mais curto."
        ),
        "provider_unavailable": "O provedor de IA está indisponível no momento.",
    }.get(getattr(exc, "code", ""), "Não foi possível analisar os documentos.")


@router.get(
    "/document-models/{model_id}/training-files", response_model=list[TrainingFileOut]
)
async def list_training_files(
    model_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(*_READ_PERMS)),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    result = await db.execute(
        select(DocumentModelTrainingFile)
        .where(
            DocumentModelTrainingFile.organization_id == org_id,
            DocumentModelTrainingFile.document_model_id == model.id,
            DocumentModelTrainingFile.deleted_at.is_(None),
        )
        .order_by(DocumentModelTrainingFile.created_at.desc())
    )
    return [_training_out(tf) for tf in result.scalars().all()]


@router.post(
    "/document-models/{model_id}/training-files",
    response_model=TrainingFileOut,
    status_code=201,
)
async def upload_training_file(
    model_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.train_ai", "document_model.manage")),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)

    try:
        ext, content = await validate_upload(file)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    if ext not in (".pdf", ".docx", ".txt"):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Documentos de referência devem ser TXT, PDF ou DOCX.",
        )

    scanner = get_virus_scanner()
    scan = await scanner.scan(content, file.filename or "documento")
    if not scan.clean:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"Arquivo rejeitado: {scan.message}"
        )

    try:
        text = extract_text(file.filename or "", content)
        text += extract_visual_profile(file.filename or "", content)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    org_slug = (
        await db.execute(select(Organization.slug).where(Organization.id == org_id))
    ).scalar_one_or_none()
    if org_slug:
        set_storage_tenant(org_slug)
    path = f"document-models/{model.id}/{uuid.uuid4()}{ext}"
    await storage.store(path, content)

    tf = DocumentModelTrainingFile(
        organization_id=org_id,
        document_model_id=model.id,
        filename=file.filename or "documento",
        mime_type=file.content_type,
        size_bytes=len(content),
        storage_path=path,
        sha256=compute_hash(content),
        status="analyzed" if text.strip() else "empty",
        extracted_text=text[:200_000],
        used_by_ai=False,
        created_by=user.id,
    )
    db.add(tf)
    await db.flush()
    await _audit(
        db,
        request,
        user,
        org_id,
        AuditAction.DOCUMENT_MODEL_TRAINING_FILE_ADDED,
        f"Documento de referência '{tf.filename}' adicionado ao modelo '{model.name}'.",
        model.id,
    )
    await db.commit()
    await db.refresh(tf)
    return _training_out(tf)


@router.patch(
    "/document-models/{model_id}/training-files/{file_id}", response_model=TrainingFileOut
)
async def update_training_file(
    model_id: uuid.UUID,
    file_id: uuid.UUID,
    body: TrainingFileUpdateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.train_ai", "document_model.manage")),
):
    org_id = _org(user)
    await _model_or_404(db, org_id, model_id)
    tf = await _training_or_404(db, org_id, file_id)
    if body.used_by_ai is not None:
        if body.used_by_ai and not (tf.extracted_text and tf.extracted_text.strip()):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Documento sem texto extraído não pode ser usado pela IA.",
            )
        tf.used_by_ai = body.used_by_ai
    await db.flush()
    await db.commit()
    await db.refresh(tf)
    return _training_out(tf)


@router.delete(
    "/document-models/{model_id}/training-files/{file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_training_file(
    model_id: uuid.UUID,
    file_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.train_ai", "document_model.manage")),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    tf = await _training_or_404(db, org_id, file_id)
    filename = tf.filename
    tf.deleted_at = datetime.now(timezone.utc)
    tf.used_by_ai = False
    await db.flush()
    await _audit(
        db,
        request,
        user,
        org_id,
        AuditAction.DOCUMENT_MODEL_TRAINING_FILE_REMOVED,
        f"Documento de referência '{filename}' removido do modelo '{model.name}'.",
        model.id,
    )
    await db.commit()
    return None


@router.post(
    "/document-models/{model_id}/training-files/propose", response_model=LearnProposalOut
)
async def propose_from_training_files(
    model_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.train_ai", "document_model.manage")),
):
    """Analisa os documentos de referência e devolve uma PROPOSTA de modelo.

    Nunca aplica automaticamente: a proposta só vira rascunho quando o
    administrador cria uma nova versão a partir dela.
    """
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    result = await db.execute(
        select(DocumentModelTrainingFile).where(
            DocumentModelTrainingFile.organization_id == org_id,
            DocumentModelTrainingFile.document_model_id == model.id,
            DocumentModelTrainingFile.deleted_at.is_(None),
            DocumentModelTrainingFile.used_by_ai.is_(True),
        )
    )
    files = result.scalars().all()
    documents = [
        (tf.filename, tf.extracted_text or "")
        for tf in files
        if tf.extracted_text and tf.extracted_text.strip()
    ]
    if not documents:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Marque ao menos um documento com texto como 'utilizado pela IA'.",
        )

    try:
        api_key = await config_store.get_active_key(db, org_id)
    except (AiNotConfiguredError, AiDisabledError) as exc:
        return LearnProposalOut(
            ok=False,
            status=_ai_status_for(exc),
            message=_ai_pt_msg(exc),
            prompt_version=LEARN_PROMPT_VERSION,
        )

    try:
        config, meta = await analyze_documents(model.document_type, documents, api_key)
    except DeepSeekError as exc:
        db.add(
            AiExecution(
                organization_id=org_id,
                user_id=user.id,
                kind=AiExecutionKind.PROPOSE_STRUCTURE,
                status=AiExecutionStatus.FAILED,
                model=settings.DEEPSEEK_MODEL,
                prompt_version=LEARN_PROMPT_VERSION,
                error=exc.as_dict(),
            )
        )
        await db.commit()
        return LearnProposalOut(
            ok=False,
            status=_ai_status_for(exc),
            message=_ai_pt_msg(exc),
            prompt_version=LEARN_PROMPT_VERSION,
        )

    db.add(
        AiExecution(
            organization_id=org_id,
            user_id=user.id,
            kind=AiExecutionKind.PROPOSE_STRUCTURE,
            status=AiExecutionStatus.SUCCEEDED,
            model=meta.get("model") or settings.DEEPSEEK_MODEL,
            prompt_version=LEARN_PROMPT_VERSION,
            usage=meta.get("usage") or None,
            duration_ms=meta.get("latency_ms"),
        )
    )
    await db.commit()
    return LearnProposalOut(
        ok=True,
        status="ok",
        prompt_version=LEARN_PROMPT_VERSION,
        config=config.model_dump(mode="json"),
        sources=[name for name, _ in documents],
    )


# ── Geração por IA (extração estruturada) ──────────────────────────────────


@router.post("/document-models/ai/extract", response_model=AiExtractOut)
async def ai_extract(
    body: AiExtractIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.use")),
):
    org_id = _org(user)
    try:
        model, candidates = await pick_active_model(
            db, org_id, document_type=body.document_type, model_id=body.model_id
        )
    except ModelSelectionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

    if model is None:
        # Ambiguidade: mais de um modelo ativo sem padrão → usuário escolhe.
        return AiExtractOut(
            ambiguity=True,
            candidates=[_summary(c) for c in candidates],
            prompt_version=PROMPT_VERSION,
            note="Há mais de um modelo ativo para este tipo; selecione um explicitamente.",
        )

    cfg = dm_service.config_of_active(model)
    if cfg is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Modelo ativo sem versão configurada.")

    # A IA só é chamada se houver chave configurada na organização.
    try:
        api_key = await config_store.get_active_key(db, org_id)
    except Exception as exc:  # noqa: BLE001 - tipadas (AiNotConfigured/AiDisabled)
        return AiExtractOut(
            matched_model=_summary(model),
            values={},
            complete=False,
            prompt_version=PROMPT_VERSION,
            note=str(exc),
        )

    values = await extract_values(cfg, body.prompt, api_key)
    result = validate_and_resolve(cfg, values)
    return AiExtractOut(
        matched_model=_summary(model),
        values=result.resolved,
        pending=[p.as_dict() for p in result.pending],
        complete=result.complete,
        prompt_version=PROMPT_VERSION,
    )


@router.post("/document-models/ai/compose", response_model=AiComposeOut)
async def ai_compose_for_editor(
    body: AiComposeIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.use")),
):
    """Monta uma minuta para o editor a partir de um pedido livre.

    A IA escolhe entre modelos ativos ou em validação e devolve valores de
    campos. Título, súmula e HTML resultam da renderização determinística do
    modelo; esta rota não cria matéria, não emite número e não publica nada.
    """
    org_id = _org(user)
    try:
        api_key = await config_store.get_active_key(db, org_id)
    except (AiNotConfiguredError, AiDisabledError) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    models = await models_for_editor_composition(db, org_id, body.document_type)
    if not models:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Não há modelo cadastrado para montar esta matéria.",
        )
    try:
        model = await choose_model_for_prompt(models, body.prompt, api_key)
    except DeepSeekError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, _ai_pt_msg(exc)) from exc
    if model is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Não identifiquei um modelo compatível com o pedido.",
        )

    cfg = dm_service.config_for_editor_composition(model)
    if cfg is None:  # defesa contra estado inconsistente
        raise HTTPException(status.HTTP_409_CONFLICT, "Modelo sem versão configurada.")
    try:
        values = await extract_values(cfg, body.prompt, api_key)
        outcome = render(cfg, values)
    except (DeepSeekError, UnknownFieldError, InvalidFieldValueError) as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, _ai_pt_msg(exc) if isinstance(exc, DeepSeekError) else str(exc)) from exc

    return AiComposeOut(
        matched_model=_summary(model),
        title=outcome.document.title,
        summary=outcome.document.summary,
        content_html=semantic_to_html(outcome.document),
        values=outcome.fill.resolved,
        pending=[item.as_dict() for item in outcome.fill.pending],
        complete=outcome.complete,
        document_type=model.document_type,
        prompt_version=PROMPT_VERSION,
    )


# ── Material (minuta) a partir do modelo + numeração ───────────────────────


@router.post(
    "/document-models/{model_id}/versions/{version}/material",
    response_model=MaterialOut,
    status_code=201,
)
async def material_from_model(
    model_id: uuid.UUID,
    version: int,
    body: MaterialFromModelIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.use")),
):
    org_id = _org(user)
    model = await _model_or_404(db, org_id, model_id)
    v = _version_or_404(model, version)
    config = DocumentModelConfig.model_validate(v.config_json)

    act_type = await db.execute(select(ActType).where(ActType.id == body.act_type_id))
    if act_type.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tipo de ato inválido.")

    try:
        outcome = render(config, body.values)
    except (UnknownFieldError, InvalidFieldValueError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    if not outcome.complete:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    "Preenchimento incompleto: corrija as pendências antes de gerar a minuta."
                ),
                "pending": [p.as_dict() for p in outcome.fill.pending],
            },
        )

    try:
        matter = await create_rendered_matter(
            db,
            organization_id=org_id,
            author_id=user.id,
            act_type_id=body.act_type_id,
            document=outcome.document,
            title_override=body.title_override,
            meta={
                "source": "document_model",
                "source_model_id": str(model_id),
                "source_model_version": version,
                "model_slug": model.slug,
            },
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    await _audit(
        db,
        request,
        user,
        org_id,
        AuditAction.DOCUMENT_MODEL_MATERIAL_CREATED,
        f"Minuta criada do modelo '{model.name}' v{version}.",
        model.id,
    )
    await db.commit()
    await db.refresh(matter)
    return MaterialOut(
        id=matter.id,
        title=matter.title,
        status=str(matter.status),
        act_number=matter.act_number,
        act_year=matter.act_year,
        document_type=model.document_type,
    )


@router.post("/numbering/issue", response_model=NumberIssueOut)
async def issue_number(
    body: NumberIssueIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(
        require_permission("matter.approve", "matter.publish", "document_model.approve")
    ),
):
    org_id = _org(user)
    result = await db.execute(
        select(Matter).where(Matter.id == body.matter_id, Matter.organization_id == org_id)
    )
    matter = result.scalar_one_or_none()
    if matter is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Matéria não encontrada.")

    target_year = body.year or document_numbering.institutional_year()
    had_before = bool(matter.act_number) and matter.act_year == target_year
    number, year = await document_numbering.issue_number_to_matter(db, matter, year=body.year)
    already = had_before and str(matter.act_number) == str(number)
    await _audit(
        db,
        request,
        user,
        org_id,
        AuditAction.ACT_NUMBER_ISSUED,
        f"Número {number}/{year} atribuído à matéria {matter.id}.",
        matter.id,
    )
    await db.commit()
    return NumberIssueOut(matter_id=matter.id, number=number, year=year, already_assigned=already)


async def _audit(
    db, request: Request, user: User, org_id, action: AuditAction, description: str, entity_id
):
    info = await capture_request_info(request)
    await log_audit_event(
        db,
        action=action,
        user_id=user.id,
        organization_id=org_id,
        entity_type="document_model",
        entity_id=entity_id,
        description=description,
        ip_address=info.get("ip_address"),
    )
