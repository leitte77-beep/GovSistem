"""Serviço de anexos do prontuário — com validação de tipo/MIME/tamanho."""

import os
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.storage import storage
from app.models.case_file_attachment import CaseFileAttachment


def _validate_upload(filename: str | None, content_type: str | None) -> str:
    if not filename:
        raise HTTPException(status_code=400, detail="Nome do arquivo é obrigatório")
    ext = os.path.splitext(filename)[1].lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422, detail=f"Extensão não permitida: {ext or '(sem extensão)'}"
        )
    if content_type and content_type not in settings.ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=422, detail=f"Tipo de conteúdo não permitido: {content_type}"
        )
    return ext.lstrip(".") or "bin"


async def upload_case_file_attachment(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    case_file_id: uuid.UUID,
    file: UploadFile,
    tipo_documento: str,
    enviado_por_id: uuid.UUID,
    attendance_id: uuid.UUID | None = None,
) -> CaseFileAttachment:
    _validate_upload(file.filename, file.content_type)

    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(65536)
        if not chunk:
            break
        total += len(chunk)
        if total > settings.MAX_UPLOAD_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Arquivo excede {settings.MAX_UPLOAD_SIZE_MB} MB",
            )
        chunks.append(chunk)
    content = b"".join(chunks)

    max_version = (
        await db.execute(
            select(func.coalesce(func.max(CaseFileAttachment.versao), 0)).where(
                CaseFileAttachment.tenant_id == tenant_id,
                CaseFileAttachment.case_file_id == case_file_id,
                CaseFileAttachment.tipo_documento == tipo_documento,
                CaseFileAttachment.deleted_at.is_(None),
            )
        )
    ).scalar_one()
    next_version = int(max_version) + 1

    now = datetime.now(timezone.utc)
    ext = _validate_upload(file.filename, None)
    storage_path = (
        f"govsocial/{tenant_id}/case_files/{case_file_id}/"
        f"{tipo_documento.lower()}_v{next_version}_{now.strftime('%Y%m%d%H%M%S')}.{ext}"
    )
    await storage.store(storage_path, content)

    attachment = CaseFileAttachment(
        tenant_id=tenant_id,
        case_file_id=case_file_id,
        attendance_id=attendance_id,
        nome_arquivo=file.filename,
        tipo_documento=tipo_documento,
        storage_path=storage_path,
        content_type=file.content_type,
        tamanho_bytes=len(content),
        versao=next_version,
        enviado_por_id=enviado_por_id,
    )
    db.add(attachment)
    await db.flush()
    return attachment


async def get_attachment_bytes(attachment: CaseFileAttachment) -> bytes:
    return await storage.get(attachment.storage_path)
