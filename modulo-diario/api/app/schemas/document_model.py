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


class DocumentModelVersionCreateIn(BaseModel):
    config: DocumentModelConfig
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
    updated_at: datetime | None = None


class VersionDetailOut(VersionSummaryOut):
    config: dict


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
