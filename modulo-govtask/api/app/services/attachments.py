"""File upload with versioning support."""

import uuid
from datetime import datetime, timezone

from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import storage
from app.models.anexo import Anexo
from app.models.enums import TipoDocumento


async def upload_anexo(
    db: AsyncSession,
    file: UploadFile,
    convenio_id: uuid.UUID,
    enviado_por_id: uuid.UUID,
    tipo_documento: TipoDocumento = TipoDocumento.OUTRO,
    etapa_id: uuid.UUID | None = None,
    tarefa_id: uuid.UUID | None = None,
) -> Anexo:
    """Faz upload de um arquivo com versionamento automático."""

    content = await file.read()

    # Determina a próxima versão para este tipo_documento + contexto
    version_query = select(func.max(Anexo.versao)).where(
        Anexo.convenio_id == convenio_id,
        Anexo.tipo_documento == tipo_documento,
        Anexo.tarefa_id == tarefa_id,
        Anexo.etapa_id == etapa_id,
        Anexo.deleted_at.is_(None),
    )
    result = await db.execute(version_query)
    max_version = result.scalar() or 0
    next_version = max_version + 1

    # Gera path único
    now = datetime.now(timezone.utc)
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "bin"
    storage_path = (
        f"govtask/{convenio_id}/"
        f"{tarefa_id or 'geral'}/"
        f"{tipo_documento.value.lower()}_v{next_version}_{now.strftime('%Y%m%d%H%M%S')}.{ext}"
    )

    # Salva no storage
    await storage.store(storage_path, content)

    anexo = Anexo(
        convenio_id=convenio_id,
        etapa_id=etapa_id,
        tarefa_id=tarefa_id,
        nome_arquivo=file.filename or "arquivo",
        tipo_documento=tipo_documento,
        storage_path=storage_path,
        tamanho_bytes=len(content),
        versao=next_version,
        enviado_por_id=enviado_por_id,
    )
    db.add(anexo)
    await db.flush()
    return anexo


async def get_anexo_content(anexo: Anexo) -> bytes:
    """Recupera o conteúdo do anexo do storage."""
    # O storage atual é sync-based Minio wrapper, então usamos um approach simples
    import os
    from app.core.config import settings

    if settings.STORAGE_BACKEND == "local":
        full_path = os.path.join(settings.STORAGE_LOCAL_PATH, anexo.storage_path)
        with open(full_path, "rb") as f:
            return f.read()
    else:
        from app.core.storage import MinioStorage
        # Para MinIO, retornamos o path para download via presigned URL
        # No MVP, retornamos o path para o caller gerar URL
        raise NotImplementedError("MinIO download via presigned URL")
