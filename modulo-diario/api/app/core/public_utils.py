"""Safe, tenant-isolated read of public files (used by downloads)."""

from __future__ import annotations

import os
from pathlib import Path

from app.core.config import settings


def read_public_file(
    storage_path: str,
    tenant_slug: str | None = None,
) -> tuple[bytes | None, str | None]:
    """Read a stored file, enforcing tenant isolation and path traversal guards.

    Returns ``(content, mime)`` or ``(None, None)`` if not found / invalid.
    """
    clean = Path(storage_path or "")
    if not clean.parts or clean.is_absolute() or ".." in clean.parts:
        return None, None

    base = Path(settings.UPLOAD_DIR).resolve()

    if settings.STORAGE_TENANT_ISOLATION and tenant_slug:
        if "/" in tenant_slug or ".." in tenant_slug:
            return None, None
        candidates = [
            (base / tenant_slug / clean).resolve(),
            (base / tenant_slug / "pdf" / clean).resolve(),
        ]
    else:
        candidates = [
            (base / clean).resolve(),
            (base / "pdf" / clean).resolve(),
        ]

    for candidate in candidates:
        if (
            str(candidate).startswith(str(base))
            and candidate.is_file()
            and candidate.exists()
        ):
            try:
                content = candidate.read_bytes()
            except OSError:
                return None, None
            ext = clean.suffix.lower()
            mime = {
                ".pdf": "application/pdf",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
            }.get(ext, "application/octet-stream")
            return content, mime
    return None, None
