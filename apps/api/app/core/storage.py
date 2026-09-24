import contextvars
import logging
import os
from abc import ABC, abstractmethod
from contextlib import contextmanager
from io import BytesIO

from app.core.config import settings

logger = logging.getLogger(__name__)

_storage_tenant_ctx: contextvars.ContextVar[str] = contextvars.ContextVar(
    "storage_tenant_slug", default=""
)


def _tenant_prefix() -> str:
    if not settings.STORAGE_TENANT_ISOLATION:
        return ""
    slug = _storage_tenant_ctx.get("")
    if not slug:
        return ""
    if "/" in slug or "\\" in slug or ".." in slug:
        raise ValueError(f"Invalid tenant slug: {slug}")
    return f"{slug}/"


def set_storage_tenant(slug: str) -> None:
    _storage_tenant_ctx.set(slug)


@contextmanager
def storage_tenant_scope(slug: str):
    token = _storage_tenant_ctx.set(slug)
    try:
        yield
    finally:
        _storage_tenant_ctx.reset(token)


class StorageBackend(ABC):
    @abstractmethod
    async def store(self, path: str, content: bytes) -> str:
        ...

    @abstractmethod
    async def delete(self, path: str) -> None:
        ...

    @abstractmethod
    async def exists(self, path: str) -> bool:
        ...


class LocalStorage(StorageBackend):
    def __init__(self, base_path: str | None = None):
        self.base_path = base_path or settings.STORAGE_LOCAL_PATH
        os.makedirs(self.base_path, exist_ok=True)

    async def store(self, path: str, content: bytes) -> str:
        resolved_path = _tenant_prefix() + path
        full_path = os.path.join(self.base_path, resolved_path)
        directory = os.path.dirname(full_path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        with open(full_path, "wb") as f:
            f.write(content)
        return path

    async def delete(self, path: str) -> None:
        resolved_path = _tenant_prefix() + path
        full_path = os.path.join(self.base_path, resolved_path)
        if os.path.exists(full_path):
            os.remove(full_path)

    async def exists(self, path: str) -> bool:
        resolved_path = _tenant_prefix() + path
        return os.path.exists(os.path.join(self.base_path, resolved_path))

    def _resolve_full_path(self, path: str) -> str:
        resolved_path = _tenant_prefix() + path
        return os.path.join(self.base_path, resolved_path)

    def _resolve_full_path_for_tenant(self, path: str, tenant_slug: str) -> str:
        if settings.STORAGE_TENANT_ISOLATION and tenant_slug:
            resolved_path = f"{tenant_slug}/{path}"
        else:
            resolved_path = path
        return os.path.join(self.base_path, resolved_path)


class MinioStorage(StorageBackend):
    def __init__(self):
        self._bucket = settings.MINIO_BUCKET
        self._client = _SyncMinioClient(
            endpoint=settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY.get_secret_value(),
            secret_key=settings.MINIO_SECRET_KEY.get_secret_value(),
            secure=settings.MINIO_SECURE,
        )
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        if not self._client.bucket_exists(self._bucket):
            self._client.make_bucket(self._bucket)
            logger.info("Created MinIO bucket: %s", self._bucket)

    async def store(self, path: str, content: bytes) -> str:
        resolved_path = _tenant_prefix() + path
        self._client.put_object(
            self._bucket,
            resolved_path,
            BytesIO(content),
            len(content),
        )
        return path

    async def delete(self, path: str) -> None:
        resolved_path = _tenant_prefix() + path
        self._client.remove_object(self._bucket, resolved_path)

    async def exists(self, path: str) -> bool:
        resolved_path = _tenant_prefix() + path
        try:
            self._client.stat_object(self._bucket, resolved_path)
            return True
        except Exception:
            return False


class _SyncMinioClient:
    """Thin sync wrapper around the async MinIO client for use in sync storage."""

    def __init__(self, endpoint: str, access_key: str, secret_key: str, secure: bool):
        from minio import Minio
        self._client = Minio(
            endpoint=endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
        )

    def bucket_exists(self, bucket: str) -> bool:
        return self._client.bucket_exists(bucket)

    def make_bucket(self, bucket: str) -> None:
        self._client.make_bucket(bucket)

    def put_object(self, bucket: str, path: str, data: BytesIO, length: int) -> None:
        self._client.put_object(bucket, path, data, length)

    def remove_object(self, bucket: str, path: str) -> None:
        self._client.remove_object(bucket, path)

    def stat_object(self, bucket: str, path: str):
        return self._client.stat_object(bucket, path)


def get_storage_backend() -> StorageBackend:
    if settings.STORAGE_BACKEND == "minio":
        return MinioStorage()
    return LocalStorage()


storage = get_storage_backend()
