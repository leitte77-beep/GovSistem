import os

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

ALLOWED_BY_EXT: dict[str, list[str]] = {
    ".docx": [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    ".xlsx": [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    ".csv": ["text/csv", "text/plain", "application/octet-stream"],
    ".pdf": ["application/pdf"],
}

# Magic bytes (file signatures) for each supported extension.
# DOCX and XLSX share the ZIP magic; deeper inspection would need ZIP entry checks.
_MAGIC_BYTES: dict[str, bytes] = {
    ".docx": b"PK\x03\x04",
    ".xlsx": b"PK\x03\x04",
    ".pdf": b"%PDF",
    ".csv": b"",  # CSV is plain text — validated via UTF-8 decode
}


def get_extension(filename: str) -> str:
    _, ext = os.path.splitext(filename.lower())
    return ext


def _check_magic_bytes(ext: str, content: bytes) -> bool:
    expected = _MAGIC_BYTES.get(ext)
    if expected is None:
        return False
    if ext == ".csv":
        try:
            content.decode("utf-8")
            return True
        except UnicodeDecodeError:
            return False
    return content[: len(expected)] == expected


async def validate_upload(file: UploadFile) -> tuple[str, bytes]:
    ext = get_extension(file.filename or "file")
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Extension '{ext}' not allowed. Allowed: {settings.ALLOWED_EXTENSIONS}",
        )

    content = await file.read()
    size = len(content)

    if size > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Max: {settings.MAX_UPLOAD_SIZE_MB}MB",
        )

    if size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file",
        )

    if file.content_type:
        expected = ALLOWED_BY_EXT.get(ext, [])
        if expected and file.content_type not in expected:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"MIME type '{file.content_type}' not allowed for {ext}",
            )

    if not _check_magic_bytes(ext, content):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File content does not match extension '{ext}'",
        )

    return ext, content
