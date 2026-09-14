"""Ciclo de vida e persistência versionada dos modelos documentais.

Regras: a versão **ativa** é imutável; alterar cria uma nova versão (v+1). Uma
versão só vira ativa após aprovação explícita de usuário autorizado (o router
aplica a permissão ``document_model.approve``). Materiais já gerados ficam
ligados à versão que os criou. ``is_default`` marca o modelo padrão ativo por
escopo quando não há outro já definido (nada é sobrescrito silenciosamente).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.document_model.schemas import (
    DM_STATUS_ACTIVE,
    DM_STATUS_ARCHIVED,
    DM_STATUS_DRAFT,
    DM_STATUS_IN_APPROVAL,
    DM_STATUS_INACTIVE,
    DocumentModelConfig,
)
from app.models.document_model import DocumentModel, DocumentModelVersion


class ModelTransitionError(Exception):
    """Transição de ciclo de vida inválida."""


async def _commit_flush(db: AsyncSession, obj) -> None:
    db.add(obj)
    await db.flush()


def _next_ver(versions: list[DocumentModelVersion]) -> int:
    return max([v.version_number for v in versions], default=0) + 1


async def create_model(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    slug: str,
    name: str,
    config: DocumentModelConfig,
    layout: dict | None = None,
    parent_model_id: uuid.UUID | None = None,
    created_by: uuid.UUID | None = None,
) -> DocumentModel:
    model = DocumentModel(
        organization_id=organization_id,
        slug=slug,
        name=name,
        purpose=config.purpose,
        document_type=config.scope_document_type,
        status=DM_STATUS_DRAFT,
        parent_model_id=parent_model_id,
        created_by=created_by,
    )
    await _commit_flush(db, model)
    version = DocumentModelVersion(
        document_model_id=model.id,
        version_number=1,
        status=DM_STATUS_DRAFT,
        config_json=config.model_dump(mode="json"),
        layout_json=layout,
        config_hash=config.canonical_hash(),
        created_by=created_by,
    )
    await _commit_flush(db, version)
    await db.refresh(model)
    return model


async def create_new_version(
    db: AsyncSession,
    model_id: uuid.UUID,
    config: DocumentModelConfig,
    *,
    layout: dict | None = None,
    change_reason: str | None = None,
    created_by: uuid.UUID | None = None,
) -> DocumentModelVersion:
    """Cria uma nova versão (draft) a partir da config fornecida. Se houver uma
    versão ativa imutável, ela NÃO é alterada."""
    model = await _get_model(db, model_id)
    version = DocumentModelVersion(
        document_model_id=model.id,
        version_number=_next_ver(model.versions),
        status=DM_STATUS_DRAFT,
        config_json=config.model_dump(mode="json"),
        layout_json=layout,
        config_hash=config.canonical_hash(),
        change_reason=change_reason,
        created_by=created_by,
    )
    await _commit_flush(db, version)
    await db.refresh(version)
    return version


async def update_draft_version(
    db: AsyncSession,
    model_id: uuid.UUID,
    version_number: int,
    *,
    config: DocumentModelConfig | None = None,
    layout: dict | None = None,
    change_reason: str | None = None,
) -> DocumentModelVersion:
    """Edita uma versão em rascunho (autosave). Versões ativas são imutáveis."""
    model = await _get_model(db, model_id)
    version = _get_version(model, version_number)
    if version.status != DM_STATUS_DRAFT:
        raise ModelTransitionError(
            f"Só rascunhos podem ser editados (versão {version_number} está {version.status})."
        )
    if config is not None:
        version.config_json = config.model_dump(mode="json")
        version.config_hash = config.canonical_hash()
        model.purpose = config.purpose
        model.document_type = config.scope_document_type
    if layout is not None:
        version.layout_json = layout
    if change_reason is not None:
        version.change_reason = change_reason
    await db.flush()
    return version


async def submit_for_approval(
    db: AsyncSession, model_id: uuid.UUID, version_number: int
) -> DocumentModelVersion:
    model = await _get_model(db, model_id)
    version = _get_version(model, version_number)
    if version.status != DM_STATUS_DRAFT:
        raise ModelTransitionError(
            f"Só rascunhos podem ir para aprovação (versão {version_number} está {version.status})."
        )
    version.status = DM_STATUS_IN_APPROVAL
    model.status = DM_STATUS_IN_APPROVAL
    await db.flush()
    return version


async def approve_version(
    db: AsyncSession,
    model_id: uuid.UUID,
    version_number: int,
) -> DocumentModelVersion:
    """Aprova e ativa a versão (imutável a partir daqui)."""
    model = await _get_model(db, model_id)
    version = _get_version(model, version_number)
    if version.status != DM_STATUS_IN_APPROVAL:
        raise ModelTransitionError(
            f"Só versões em aprovação podem ser ativadas (v{version_number} está {version.status})."
        )
    version.status = DM_STATUS_ACTIVE
    model.active_version = version_number
    model.status = DM_STATUS_ACTIVE
    # Torna padrão do escopo apenas quando ainda não há outro padrão ativo.
    if model.is_default:
        pass
    else:
        other_default = await _default_active_for_scope(
            db, model.organization_id, model.document_type, exclude_model_id=model.id
        )
        if other_default is None:
            model.is_default = True
    await db.flush()
    return version


async def archive_model(db: AsyncSession, model_id: uuid.UUID) -> DocumentModel:
    model = await _get_model(db, model_id)
    model.status = DM_STATUS_ARCHIVED
    model.is_default = False
    await db.flush()
    return model


async def deactivate_model(db: AsyncSession, model_id: uuid.UUID) -> DocumentModel:
    """Desativa um modelo ativo: sai do rodízio de geração, mas mantém a versão
    ativa e o histórico. Pode ser reativado depois."""
    model = await _get_model(db, model_id)
    if model.status != DM_STATUS_ACTIVE:
        raise ModelTransitionError("Só modelos ativos podem ser desativados.")
    model.status = DM_STATUS_INACTIVE
    model.is_default = False
    await db.flush()
    return model


async def reactivate_model(db: AsyncSession, model_id: uuid.UUID) -> DocumentModel:
    """Reativa um modelo inativo (volta ao status ``active``)."""
    model = await _get_model(db, model_id)
    if model.status != DM_STATUS_INACTIVE:
        raise ModelTransitionError("Só modelos inativos podem ser reativados.")
    if model.active_version is None:
        raise ModelTransitionError("Modelo sem versão ativa não pode ser reativado.")
    model.status = DM_STATUS_ACTIVE
    if not model.is_default:
        other_default = await _default_active_for_scope(
            db, model.organization_id, model.document_type, exclude_model_id=model.id
        )
        if other_default is None:
            model.is_default = True
    await db.flush()
    return model


async def duplicate_model(
    db: AsyncSession,
    model_id: uuid.UUID,
    *,
    new_slug: str,
    new_name: str | None = None,
    created_by: uuid.UUID | None = None,
) -> DocumentModel:
    """Duplica um modelo como novo rascunho (v1), herdando config/layout da
    versão ativa (ou da última versão existente) e apontando para o original
    como ``parent_model_id``."""
    source = await _get_model(db, model_id)
    version: DocumentModelVersion | None = None
    if source.active_version is not None:
        version = next(
            (v for v in source.versions or [] if v.version_number == source.active_version),
            None,
        )
    if version is None:
        version = max(source.versions or [], key=lambda v: v.version_number, default=None)
    if version is None:
        raise ModelTransitionError("Modelo de origem não possui versões para duplicar.")
    config = DocumentModelConfig.model_validate(version.config_json)
    return await create_model(
        db,
        organization_id=source.organization_id,
        slug=new_slug,
        name=new_name or f"{source.name} (cópia)",
        config=config,
        layout=version.layout_json,
        parent_model_id=source.id,
        created_by=created_by,
    )


async def delete_model(db: AsyncSession, model_id: uuid.UUID) -> None:
    """Hard-delete a model and its versions (cascade). Reserved for purge of
    never-used drafts; the API uses ``soft_delete_model`` by default."""
    model = await _get_model(db, model_id)
    await db.delete(model)
    await db.flush()


async def soft_delete_model(db: AsyncSession, model_id: uuid.UUID) -> DocumentModel:
    """Soft-delete a model (kept for audit/history). Hides it from listings."""
    model = await _get_model(db, model_id)
    model.deleted_at = datetime.now(timezone.utc)
    model.is_default = False
    await db.flush()
    return model


async def _default_active_for_scope(
    db: AsyncSession,
    organization_id: uuid.UUID,
    document_type: str,
    *,
    exclude_model_id: uuid.UUID | None = None,
) -> DocumentModel | None:
    query = select(DocumentModel).where(
        DocumentModel.organization_id == organization_id,
        DocumentModel.document_type == document_type,
        DocumentModel.status == DM_STATUS_ACTIVE,
        DocumentModel.is_default.is_(True),
    )
    if exclude_model_id:
        query = query.where(DocumentModel.id != exclude_model_id)
    result = await db.execute(query.limit(1))
    return result.scalar_one_or_none()


async def _get_model(db: AsyncSession, model_id: uuid.UUID) -> DocumentModel:
    result = await db.execute(
        select(DocumentModel).where(
            DocumentModel.id == model_id, DocumentModel.deleted_at.is_(None)
        )
    )
    model = result.scalar_one_or_none()
    if model is None:
        raise ModelTransitionError("Modelo documental não encontrado.")
    return model


def _get_version(model: DocumentModel, version_number: int) -> DocumentModelVersion:
    for v in model.versions or []:
        if v.version_number == version_number:
            return v
    raise ModelTransitionError(f"Versão {version_number} não existe no modelo.")


def config_of_version(version: DocumentModelVersion) -> DocumentModelConfig:
    return DocumentModelConfig.model_validate(version.config_json)


def config_of_active(model: DocumentModel) -> DocumentModelConfig | None:
    if not model.active_version:
        return None
    for v in model.versions or []:
        if v.version_number == model.active_version:
            return DocumentModelConfig.model_validate(v.config_json)
    return None


__all__ = [
    "create_model",
    "create_new_version",
    "update_draft_version",
    "submit_for_approval",
    "approve_version",
    "archive_model",
    "deactivate_model",
    "reactivate_model",
    "duplicate_model",
    "delete_model",
    "soft_delete_model",
    "config_of_version",
    "config_of_active",
    "ModelTransitionError",
]
