import uuid

from pydantic import BaseModel


class SheetInfoOut(BaseModel):
    name: str
    columns: list[str]
    row_count: int


class ImportResponse(BaseModel):
    file_id: uuid.UUID
    filename: str
    size_bytes: int
    hash: str
    mime_type: str
    content_html: str | None = None
    plain_text: str | None = None
    sheets: list[SheetInfoOut] | None = None
    pages: int | None = None
    ocr_needed: bool = False
    message: str = "File imported successfully"


class ImportError(BaseModel):
    detail: str
