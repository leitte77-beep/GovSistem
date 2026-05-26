from pydantic import BaseModel


class LegacyUploadResponse(BaseModel):
    filename: str
    sha256: str
    detected_date: str | None = None
    valid: bool
    error: str | None = None


class LegacyValidateRequest(BaseModel):
    files: list[str]


class LegacyImportResponse(BaseModel):
    total: int
    success: int
    errors: list[dict] = []
    editions_created: list[str] = []
    message: str
