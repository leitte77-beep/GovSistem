"""Schemas de API para modelos documentais (DocumentModel / versões).

Reutiliza ``DocumentModelConfig`` (validação do motor) e ``SemanticDocument``
como saída de preview. As respostas nunca trazem segredos nem campos
inexistentes.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.document_model.schemas import DocumentModelConfig


class DocumentModelCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=1, max_length=120, pattern=r"^[a-z0-9_-]+$")
    config: DocumentModelConfig
    layout: Optional[dict] = None
    parent_model_id: Optional[uuid.UUID] = None


class DocumentModelVersionCreateIn(BaseModel):
    config: DocumentModelConfig
    layout: Optional[dict] = None
    change_reason: Optional[str] = Field(default=None, max_length=1000)


class DocumentModelVersionUpdateIn(BaseModel):
    """Edição de uma versão em rascunho (autosave do construtor visual)."""

    config: Optional[DocumentModelConfig] = None
    layout: Optional[dict] = None
    change_reason: Optional[str] = Field(default=None, max_length=1000)


class RenderPreviewIn(BaseModel):
    values: dict[str, str] = Field(default_factory=dict)


class PreviewOut(BaseModel):
    complete: bool
    pending: list[dict] = Field(default_factory=list)
    document: dict
    canonical_text: str = ""
    free_text: list[str] = Field(default_factory=list)


class VersionSummaryOut(BaseModel):
    version_number: int
    status: str
    config_hash: str
    change_reason: Optional[str] = None
    created_at: datetime | None = None


class DocumentModelSummaryOut(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    purpose: str
    document_type: str
    status: str
    is_default: bool
    active_version: Optional[int] = None
    parent_model_id: Optional[uuid.UUID] = None
    created_by: Optional[uuid.UUID] = None
    created_by_name: Optional[str] = None
    usage_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DocumentModelDuplicateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    slug: Optional[str] = Field(
        default=None, min_length=1, max_length=120, pattern=r"^[a-z0-9_-]+$"
    )


class DocumentModelHistoryEntryOut(BaseModel):
    id: uuid.UUID
    action: str
    description: Optional[str] = None
    user_id: Optional[uuid.UUID] = None
    user_name: Optional[str] = None
    created_at: datetime | None = None


class VersionDetailOut(VersionSummaryOut):
    config: dict
    layout: Optional[dict] = None


class DocumentModelDetailOut(DocumentModelSummaryOut):
    description: str = ""
    versions: list[VersionSummaryOut] = Field(default_factory=list)


class AiExtractIn(BaseModel):
    """Geração estruturada: localiza o modelo e extrai/valida valores do
    pedido em linguagem natural."""

    prompt: str = Field(min_length=3, max_length=8000)
    document_type: str | None = Field(default=None, pattern=r"^[a-z_]+$")
    model_id: uuid.UUID | None = None


class AiExtractOut(BaseModel):
    matched_model: DocumentModelSummaryOut | None = None
    ambiguity: bool = False
    candidates: list[DocumentModelSummaryOut] = Field(default_factory=list)
    values: dict[str, str] = Field(default_factory=dict)
    pending: list[dict] = Field(default_factory=list)
    complete: bool = False
    prompt_version: str = ""
    note: str | None = None


class MaterialFromModelIn(BaseModel):
    """Cria uma matéria (rascunho) a partir de uma versão de modelo preenchida.

    Exige preenchimento completo (sem pendências) — não se finge sucesso.
    """

    act_type_id: uuid.UUID
    values: dict[str, str] = Field(default_factory=dict)
    title_override: Optional[str] = Field(default=None, max_length=500)


class MaterialOut(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    act_number: Optional[str] = None
    act_year: Optional[int] = None
    document_type: str = ""


class NumberIssueIn(BaseModel):
    matter_id: uuid.UUID
    year: Optional[int] = None


class NumberIssueOut(BaseModel):
    matter_id: uuid.UUID
    number: int
    year: int
    already_assigned: bool = False


class DocumentModelBlockCreateIn(BaseModel):
    """Bloco reutilizável (biblioteca de blocos)."""

    name: str = Field(min_length=1, max_length=200)
    kind: str = Field(default="text", min_length=1, max_length=30)
    description: Optional[str] = Field(default=None, max_length=2000)
    content_json: dict = Field(default_factory=dict)
    is_active: bool = True


class DocumentModelBlockUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    kind: Optional[str] = Field(default=None, min_length=1, max_length=30)
    description: Optional[str] = Field(default=None, max_length=2000)
    content_json: Optional[dict] = None
    is_active: Optional[bool] = None


class DocumentModelBlockOut(BaseModel):
    id: uuid.UUID
    name: str
    kind: str
    description: Optional[str] = None
    content_json: dict
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TrainingFileOut(BaseModel):
    id: uuid.UUID
    filename: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    status: str
    used_by_ai: bool
    has_text: bool = False
    created_at: datetime | None = None


class TrainingFileUpdateIn(BaseModel):
    used_by_ai: Optional[bool] = None


class LearnProposalOut(BaseModel):
    """Proposta de modelo gerada pela IA a partir dos documentos de referência."""

    ok: bool
    status: str = "ok"
    message: Optional[str] = None
    prompt_version: str = ""
    config: Optional[dict] = None
    sources: list[str] = Field(default_factory=list)
