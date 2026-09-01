import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.semantic.schemas import SemanticDocument


class SemanticAnalyzeRequest(BaseModel):
    html: str | None = None
    plain: str | None = None
    title: str = ""
    summary: str = ""
    document_type: str = "ato_oficial"


class SemanticAnalyzeResponse(BaseModel):
    document: SemanticDocument
    source_hash: str
    text_integrity_hash: str
    integrity: dict
    validation: dict


class SemanticSaveRequest(BaseModel):
    document: SemanticDocument
    template_id: Optional[uuid.UUID] = None
    template_version: Optional[int] = None
    confirm_all: bool = False


class TemplateCreateRequest(BaseModel):
    name: str
    slug: str
    document_type: str = "outro"


class TemplateVersionCreateRequest(BaseModel):
    config: dict
    change_reason: str | None = None


class TemplateActivateRequest(BaseModel):
    version_number: int
    reason: str = ""


class TemplateVersionOut(BaseModel):
    id: uuid.UUID
    version_number: int
    status: str
    config_hash: str
    change_reason: str | None
    created_by: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TemplateOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    document_type: str
    is_default: bool
    status: str
    active_version: int | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    versions: list[TemplateVersionOut] = []

    model_config = {"from_attributes": True}


class SnapshotOut(BaseModel):
    edition_id: str
    content_manifest_hash: str
    frozen_at: str
    is_valid: bool


class PublicEditionPage(BaseModel):
    edition: dict
    snapshot: dict
    authenticity: dict
    artifacts: list[dict]
