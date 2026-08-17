"""Armazenamento de componentes digitais (Fase 1: local + stub MinIO).

Todo objeto é armazenado sob prefixo do tenant para isolamento. Na Fase 2 o
backend MinIO assume com as mesmas assinaturas (interface estável).
"""

import hashlib
import os
import uuid

from app.core.config import settings


def _tenant_prefix(tenant_id: uuid.UUID) -> str:
    return str(tenant_id).replace("-", "")


def _local_path(tenant_id: uuid.UUID, storage_key: str) -> str:
    base = settings.STORAGE_LOCAL_PATH
    return os.path.join(base, _tenant_prefix(tenant_id), storage_key)


async def salvar(tenant_id: uuid.UUID, content: bytes, storage_key: str) -> str:
    """Persiste o conteúdo e devolve o `storage_key` (chave lógica, sem segredo)."""
    if settings.STORAGE_BACKEND == "local":
        path = _local_path(tenant_id, storage_key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(content)
        return storage_key

    # Fase 2: MinIO. Mantém a mesma interface (storage_key prefixado por tenant).
    from app.core.storage_minio import salvar_minio

    return await salvar_minio(tenant_id, content, storage_key)


async def ler(tenant_id: uuid.UUID, storage_key: str) -> bytes:
    if settings.STORAGE_BACKEND == "local":
        path = _local_path(tenant_id, storage_key)
        with open(path, "rb") as fh:
            return fh.read()

    from app.core.storage_minio import ler_minio

    return await ler_minio(tenant_id, storage_key)


def gerar_storage_key(tenant_id: uuid.UUID, nome_original: str) -> str:
    ext = os.path.splitext(nome_original or "")[1].lower() or ".bin"
    return f"{uuid.uuid4().hex}{ext}"


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def sha512(content: bytes) -> str:
    return hashlib.sha512(content).hexdigest()
