import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from app.models.enums import EditionStatus, EditionType


class EditionCreate(BaseModel):
    number: int | None = None
    year: int
    type: EditionType = EditionType.NORMAL
    title: str | None = None
    subtitle: str | None = None
    publication_date: date
    # When true, the edition is created already assembling every APPROVED
    # matter in the publication queue (optionally only those dated queue_date).
    auto_fill_approved: bool = False
    queue_date: date | None = None

    @field_validator("number")
    @classmethod
    def number_positive(cls, v: int | None) -> int | None:
        if v is not None and v < 1:
            raise ValueError("Number must be >= 1")
        return v

    @field_validator("year")
    @classmethod
    def year_valid(cls, v: int) -> int:
        if v < 2000 or v > 2100:
            raise ValueError("Year out of range")
        return v


class EditionUpdate(BaseModel):
    title: str | None = None
    subtitle: str | None = None
    publication_date: date | None = None


class NextEditionNumberResponse(BaseModel):
    year: int
    type: EditionType
    next_number: int
    auto_numbering: bool


class EditionItemOut(BaseModel):
    id: uuid.UUID
    matter_id: uuid.UUID
    matter_title: str = ""
    section_title: str | None = None
    position: int
    page_number: int | None = None

    model_config = {"from_attributes": True}


class EditionResponse(BaseModel):
    id: uuid.UUID
    number: int
    year: int
    type: EditionType
    title: str
    subtitle: str | None
    publication_date: date
    status: EditionStatus
    created_by: uuid.UUID
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime
    items: list[EditionItemOut] = []
    item_count: int = 0

    model_config = {"from_attributes": True}


class PublicationQueueItem(BaseModel):
    matter_id: uuid.UUID
    title: str
    summary: str | None = None
    act_number: str | None = None
    act_year: int | None = None
    act_date: date | None = None
    act_type_id: uuid.UUID
    act_type_name: str | None = None
    org_unit_id: uuid.UUID | None = None
    org_unit_name: str | None = None
    suggested_section: str
    target_date: date | None = None


class PublicationQueueResponse(BaseModel):
    total: int
    items: list[PublicationQueueItem]


class EditionListResponse(BaseModel):
    id: uuid.UUID
    number: int
    year: int
    type: EditionType
    title: str
    status: EditionStatus
    publication_date: date
    published_at: Optional[datetime] = None
    created_at: datetime
    item_count: int = 0
    signature_count: int = 0

    model_config = {"from_attributes": True}


class AddItemRequest(BaseModel):
    matter_id: uuid.UUID
    section_title: str | None = None
    position: int | None = None


class ReorderItem(BaseModel):
    id: uuid.UUID
    position: int


class ReorderRequest(BaseModel):
    items: list[ReorderItem]


class SignRequest(BaseModel):
    signing_credential_id: uuid.UUID | None = None
    pfx_base64: str | None = None
    pfx_password: str | None = None
    reason: str = "Assinatura de Edição"
    location: str = ""
    visible: bool = False


class SignResponse(BaseModel):
    verification_code: str
    signed_pdf_hash: str
    certificate_subject: str
    certificate_serial: str
    signed_at: str
    message: str = "Edition signed successfully"


class ValidateSignatureResponse(BaseModel):
    edition_id: str
    status: str
    signed_at: str
    certificate_subject: str
    certificate_serial: str
    certificate_thumbprint: str
    verification_code: str
    chain_trusted: bool = False
    issues: list[str] = []
    recommendation: str = "OK"


class PublishResponse(BaseModel):
    edition_id: str
    status: str
    published_at: str
    verification_code: str
    immutability_hash: str
    message: str
