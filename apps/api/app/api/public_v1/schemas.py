"""Public API v1 schemas - only exposes PUBLISHED data."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class PaginationMeta(BaseModel):
    page: int = Field(..., description="Current page (0-indexed)")
    page_size: int = Field(..., description="Items per page")
    total: int = Field(..., description="Total items matching query")
    total_pages: int = Field(..., description="Total number of pages")
    next_url: str | None = Field(None, description="URL for next page")
    prev_url: str | None = Field(None, description="URL for previous page")


class EditionSummary(BaseModel):
    id: uuid.UUID = Field(..., description="Edition UUID")
    number: int = Field(..., description="Edition number")
    year: int = Field(..., description="Year")
    type: str = Field(..., description="Type: normal, extra, suplementar")
    title: str = Field(..., description="Edition title")
    subtitle: str | None = Field(None, description="Edition subtitle")
    daily_summary: str | None = Field(None, description="Summary of matters in the edition")
    publication_date: date = Field(..., description="Publication date")
    verification_code: str | None = Field(None, description="Verification code")
    item_count: int = Field(0, description="Number of matters")
    signature_count: int = Field(0, description="Number of signatures")
    pdf_url: str | None = Field(None, description="Download URL for signed PDF")


class EditionListResponse(BaseModel):
    data: list[EditionSummary] = Field(..., description="List of editions")
    pagination: PaginationMeta


class MatterAttachmentPublic(BaseModel):
    id: uuid.UUID = Field(..., description="Attachment UUID")
    title: str | None = Field(None, description="Attachment title")
    type: str = Field(..., description="Attachment type")
    filename: str | None = Field(None, description="Original filename")
    mime_type: str | None = Field(None, description="MIME type")
    size_bytes: int | None = Field(None, description="File size")
    download_url: str | None = Field(None, description="Download URL")


class EditionMatterPublic(BaseModel):
    id: uuid.UUID = Field(..., description="Matter UUID")
    title: str = Field(..., description="Matter title")
    summary: str | None = Field(None, description="Brief summary")
    content_html: str = Field("", description="Sanitized HTML content")
    act_type: str = Field("", description="Act type name")
    org_unit: str = Field("", description="Org unit abbreviation")
    author: str = Field("", description="Author name")


class EditionItemPublic(BaseModel):
    id: uuid.UUID = Field(..., description="Item UUID")
    position: int = Field(..., description="Order position")
    section_title: str | None = Field(None, description="Section name")
    matter_id: uuid.UUID | None = Field(None, description="Matter UUID")
    matter_title: str | None = Field(None, description="Matter title")
    matter: EditionMatterPublic | None = Field(None, description="Full matter content")


class EditionDetail(BaseModel):
    id: uuid.UUID = Field(..., description="Edition UUID")
    number: int = Field(..., description="Edition number")
    year: int = Field(..., description="Year")
    type: str = Field(..., description="Type: normal, extra, suplementar")
    title: str = Field(..., description="Edition title")
    subtitle: str | None = Field(None, description="Edition subtitle")
    publication_date: date = Field(..., description="Publication date")
    verification_code: str | None = Field(None, description="Verification code")
    pdf_hash: str | None = Field(None, description="SHA-256 of signed PDF")
    immutability_hash: str | None = Field(None, description="Immutability hash")
    published_at: datetime | None = Field(None, description="Publication timestamp")
    pdf_url: str | None = Field(None, description="Download URL for signed PDF")
    items: list[EditionItemPublic] = Field(default_factory=list)
    signatures: list[dict] = Field(default_factory=list)


class MatterSummary(BaseModel):
    id: uuid.UUID = Field(..., description="Matter UUID")
    title: str = Field(..., description="Matter title")
    summary: str | None = Field(None, description="Brief summary")
    act_type: str = Field("", description="Act type name")
    org_unit: str = Field("", description="Org unit abbreviation")
    edition_number: str | None = Field(None, description="Edition reference")
    publication_date: date | None = Field(None, description="Publication date")
    pdf_url: str | None = Field(None, description="Link to parent edition PDF")


class MatterListResponse(BaseModel):
    data: list[MatterSummary] = Field(..., description="List of matters")
    pagination: PaginationMeta


class MatterDetailPublic(BaseModel):
    id: uuid.UUID = Field(..., description="Matter UUID")
    title: str = Field(..., description="Matter title")
    summary: str | None = Field(None, description="Brief summary")
    content_html: str = Field(..., description="Sanitized HTML content")
    act_type: str = Field("", description="Act type name")
    org_unit: str = Field("", description="Org unit abbreviation")
    author: str = Field("", description="Author name")
    published_at: datetime | None = Field(None, description="Publication timestamp")
    attachments: list[MatterAttachmentPublic] = Field(default_factory=list)


class VerifyResult(BaseModel):
    valid: bool = Field(..., description="Whether verification code is valid")
    edition_id: uuid.UUID | None = Field(None, description="Edition UUID")
    edition_title: str | None = Field(None, description="Edition title")
    edition_number: int | None = Field(None, description="Edition number")
    edition_year: int | None = Field(None, description="Edition year")
    publication_date: date | None = Field(None, description="Publication date")
    pdf_hash: str | None = Field(None, description="SHA-256 of signed PDF")
    immutability_hash: str | None = Field(None, description="Immutability hash")
    certificate_subject: str | None = Field(None, description="Signer certificate subject")
    certificate_name: str | None = Field(None, description="Signer display name")
    certificate_document: str | None = Field(None, description="Signer CPF or CNPJ")
    signed_at: datetime | None = Field(None, description="Signature timestamp")
    verification_url: str | None = Field(None, description="Verification page URL")
    message: str = Field(..., description="Result message")
