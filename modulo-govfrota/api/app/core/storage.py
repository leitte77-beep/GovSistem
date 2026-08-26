"""Abstração de armazenamento de arquivos do GovFrota.

Suporta dois backends selecionados via ``STORAGE_BACKEND``:
  - ``local``  → filesystem (volume) — padrão e usado em desenvolvimento/CI.
  - ``minio``  → S3-compatible object storage (MinIO) — padrão de produção,
                 replicando a arquitetura usada pelo GovTask.

O backend NÃO depende de filesystem local; todo acesso passa por esta
abstração. As chaves dos objetos são sempre geradas no servidor
(``govfrota/{org}/{categoria}/{uuid}.{ext}``), nunca a partir do nome do
arquivo enviado, o que elimina path traversal e torna os nomes imprevisíveis.
"""

import io
import logging
import uuid
from abc import ABC, abstractmethod
from datetime import timedelta
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)


def _ensure_bytes(content: bytes | str | memoryview) -> bytes:
    if isinstance(content, str):
        return content.encode("utf-8")
    if isinstance(content, memoryview):
        return content.tobytes()
    return content


def build_key(organization_id, categoria: str, filename: str, ext: str) -> str:
    """Gera uma chave de objeto segura e imprevisível, isolada por organização."""
    org = str(organization_id)
    nome = f"{uuid.uuid4().hex}{ext.lower()}"
    return f"govfrota/{org}/{categoria}/{nome}"


class StorageBackend(ABC):
    """Interface comum de armazenamento."""

    @abstractmethod
    def store(self, key: str, content: bytes, content_type: str | None = None) -> str:
        """Persiste o objeto e retorna a chave (key)."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Remove o objeto, se existir."""

    @abstractmethod
    def exists(self, key: str) -> bool:
        """Verifica se o objeto existe."""

    @abstractmethod
    def read(self, key: str) -> bytes:
        """Lê o conteúdo completo do objeto."""

    @abstractmethod
    def get_presigned_url(self, key: str, expires: int | None = None) -> str | None:
        """Retorna uma URL temporária de download ou None se não aplicável."""

    @abstractmethod
    def verify(self) -> bool:
        """Verifica conectividade/operação do backend (para healthcheck)."""


class LocalStorage(StorageBackend):
    """Armazenamento em filesystem local (volume)."""

    def __init__(self):
        self._base = Path(settings.STORAGE_LOCAL_PATH)
        self._base.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # key é sempre gerada pelo servidor; defesa extra contra traversal.
        parts = [p for p in key.split("/") if p and p not in (".", "..")]
        return self._base.joinpath(*parts)

    def store(self, key: str, content: bytes, content_type: str | None = None) -> str:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(_ensure_bytes(content))
        return key

    def delete(self, key: str) -> None:
        path = self._path(key)
        if path.exists():
            path.unlink(missing_ok=True)

    def exists(self, key: str) -> bool:
        return self._path(key).exists()

    def read(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def get_presigned_url(self, key: str, expires: int | None = None) -> str | None:
        # No backend local o download passa pela API autenticada (FileResponse).
        return None

    def verify(self) -> bool:
        return self._base.exists()


class MinioStorage(StorageBackend):
    """Armazenamento em MinIO (S3-compatible), bucket privado."""

    def __init__(self):
        from minio import Minio

        self._bucket = settings.MINIO_BUCKET
        self._client = Minio(
            endpoint=settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY.get_secret_value(),
            secret_key=settings.MINIO_SECRET_KEY.get_secret_value(),
            secure=settings.MINIO_SECURE,
        )
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        if not self._client.bucket_exists(self._bucket):
            self._client.make_bucket(self._bucket)
            logger.info("Bucket MinIO criado: %s", self._bucket)

    def store(self, key: str, content: bytes, content_type: str | None = None) -> str:
        data = _ensure_bytes(content)
        # put_object exige um objeto file-like; BytesIO evita
        # AttributeError: 'bytes' object has no attribute 'read'.
        self._client.put_object(
            self._bucket,
            key,
            io.BytesIO(data),
            length=len(data),
            content_type=content_type or "application/octet-stream",
        )
        return key

    def delete(self, key: str) -> None:
        self._client.remove_object(self._bucket, key)

    def exists(self, key: str) -> bool:
        try:
            self._client.stat_object(self._bucket, key)
            return True
        except Exception:
            return False

    def read(self, key: str) -> bytes:
        response = self._client.get_object(self._bucket, key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def get_presigned_url(self, key: str, expires: int | None = None) -> str | None:
        exp = expires or settings.MINIO_PRESIGNED_EXPIRY
        # O SDK minio exige timedelta em presigned_get_object.
        return self._client.presigned_get_object(
            self._bucket, key, expires=timedelta(seconds=exp)
        )

    def verify(self) -> bool:
        return self._client.bucket_exists(self._bucket)


def get_storage_backend() -> StorageBackend:
    if settings.STORAGE_BACKEND == "minio":
        return MinioStorage()
    return LocalStorage()


# Singleton — a mesma instância é usada por toda a aplicação.
storage = get_storage_backend()
