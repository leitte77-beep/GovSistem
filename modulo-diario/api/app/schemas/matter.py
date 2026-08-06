import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator

from app.core.html_sanitizer import sanitize_html
from app.models.enums import MatterStatus


class MatterCreate(BaseModel):
    title: str
    summary: str | None = None
    act_type_id: uuid.UUID
    org_unit_id: uuid.UUID | None = None
    content_html: str
    content_json: dict | None = None

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Title cannot be empty")
        return v

    @field_validator("content_html")
    @classmethod
    def sanitize(cls, v: str) -> str:
        return sanitize_html(v)


class MatterUpdate(BaseModel):
    title: str | None = None
    summary: str | None = None
    act_type_id: uuid.UUID | None = None
    org_unit_id: uuid.UUID | None = None
    content_html: str | None = None
    content_json: dict | None = None

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Title cannot be empty")
        return v

    @field_validator("content_html")
    @classmethod
    def sanitize(cls, v: str | None) -> str | None:
        if v is not None:
            return sanitize_html(v)
        return v


class AttachmentOut(BaseModel):
    id: uuid.UUID
    file_id: uuid.UUID
    title: str | None
    type: str
    position: int

    model_config = {"from_attributes": True}


class MatterResponse(BaseModel):
    id: uuid.UUID
    title: str
    summary: str | None
    act_type_id: uuid.UUID
    org_unit_id: uuid.UUID | None
    content_html: str
    content_json: dict | None
    plain_text: str
    status: MatterStatus
    version: int
    author_id: uuid.UUID
    reviewed_by: uuid.UUID | None
    published_at: datetime | None
    is_erratum: bool
    created_at: datetime
    updated_at: datetime
    attachments: list[AttachmentOut] = []

    model_config = {"from_attributes": True}


class MatterListResponse(BaseModel):
    id: uuid.UUID
    title: str
    summary: str | None
    act_type_id: uuid.UUID
    org_unit_id: uuid.UUID | None
    status: MatterStatus
    version: int
    author_id: uuid.UUID
    reviewed_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    attachment_count: int = 0

    model_config = {"from_attributes": True}


class MatterNextTitleResponse(BaseModel):
    title: str
    next_number: int
    last_number: int


class MessageResponse(BaseModel):
    message: str
