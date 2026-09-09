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

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import require_permission
from app.document_model import service as dm_service
from app.document_model.errors import InvalidFieldValueError, UnknownFieldError
from app.document_model.fill import validate_and_resolve
from app.document_model.generation import (
    PROMPT_VERSION,
    ModelSelectionError,
    extract_values,
    pick_active_model,
)
from app.document_model.ingest import create_rendered_matter
from app.document_model.renderer import render
from app.document_model.schemas import DocumentModelConfig
from app.middleware.audit import capture_request_info, log_audit_event
from app.models.act_type import ActType
from app.models.document_model import DocumentModel, DocumentModelVersion
from app.models.edition import Edition
from app.models.edition_item import EditionItem
from app.models.enums import AuditAction
from app.models.matter import Matter
from app.models.user import User
from app.schemas.document_model import (
    AiExtractIn,
    AiExtractOut,
    DocumentModelCreateIn,
    DocumentModelDetailOut,
    DocumentModelSummaryOut,
    DocumentModelVersionCreateIn,
    MaterialFromModelIn,
    MaterialOut,
    NumberIssueIn,
    NumberIssueOut,
    PreviewOut,
    RenderPreviewIn,
    VersionDetailOut,
    VersionSummaryOut,
)
from app.services import document_numbering
from app.services.ai import config_store

router = APIRouter(tags=["document-models"])

_READ_PERMS = ("document_model.use", "document_model.manage", "document_model.approve")


def _org(user: User) -> uuid.UUID:
    if not user.organization_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Escopo de organização necessário.")
    return user.organization_id


async def _model_or_404(db: AsyncSession, org_id: uuid.UUID, model_id: uuid.UUID) -> DocumentModel:
    result = await db.execute(
        select(DocumentModel).where(
            DocumentModel.id == model_id, DocumentModel.organization_id == org_id
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


def _summary(model: DocumentModel) -> DocumentModelSummaryOut:
    return DocumentModelSummaryOut(
        id=model.id,
        slug=model.slug,
        name=model.name,
        purpose=model.purpose,
        document_type=model.document_type,
        status=model.status,
        is_default=model.is_default,
        active_version=model.active_version,
        updated_at=model.updated_at,
    )


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
    query = select(DocumentModel).where(DocumentModel.organization_id == org_id)
    if document_type:
        query = query.where(DocumentModel.document_type == document_type)
    if status_filter:
        query = query.where(DocumentModel.status == status_filter)
    query = query.order_by(DocumentModel.document_type, DocumentModel.purpose)
    result = await db.execute(query)
    return [_summary(m) for m in result.scalars().all()]


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
    return DocumentModelDetailOut(
        **_summary(model).model_dump(),
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
    )


# ── Criação / versão / ciclo de vida ───────────────────────────────────────


@router.post("/document-models", response_model=DocumentModelSummaryOut, status_code=201)
async def create_document_model(
    body: DocumentModelCreateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("document_model.manage")),
):
    org_id = _org(user)
    exists = await db.execute(
        select(DocumentModel.id).where(
            DocumentModel.organization_id == org_id, DocumentModel.slug == body.slug
        )
    )
    if exists.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Slug já em uso nesta organização.")
    model = await dm_service.create_model(
        db,
        organization_id=org_id,
        slug=body.slug,
        name=body.name,
        config=body.config,
        created_by=user.id,
    )
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
        db, model.id, body.config, change_reason=body.change_reason, created_by=user.id
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
    )


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
