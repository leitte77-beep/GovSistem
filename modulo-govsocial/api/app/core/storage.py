import asyncio
import logging
import os
from abc import ABC, abstractmethod
from io import BytesIO

from app.core.config import settings

logger = logging.getLogger(__name__)


class StorageBackend(ABC):
    @abstractmethod
    async def store(self, path: str, content: bytes) -> str:
        ...

    @abstractmethod
    async def get(self, path: str) -> bytes:
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
        full_path = os.path.join(self.base_path, path)
        directory = os.path.dirname(full_path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._write_file, full_path, content)
        return path

    @staticmethod
    def _write_file(full_path: str, content: bytes):
        with open(full_path, "wb") as f:
            f.write(content)

    async def get(self, path: str) -> bytes:
        full_path = os.path.join(self.base_path, path)
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._read_file, full_path)

    @staticmethod
    def _read_file(full_path: str) -> bytes:
        with open(full_path, "rb") as f:
            return f.read()

    async def delete(self, path: str) -> None:
        full_path = os.path.join(self.base_path, path)
        if os.path.exists(full_path):
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, os.remove, full_path)

    async def exists(self, path: str) -> bool:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, os.path.exists, os.path.join(self.base_path, path)
        )


class MinioStorage(StorageBackend):
    """MinIO storage com operações offloaded para thread pool (não bloqueia event loop)."""

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
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            self._client.put_object,
            self._bucket,
            path,
            BytesIO(content),
            len(content),
        )
        return path

    async def get(self, path: str) -> bytes:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, self._client.get_object, self._bucket, path
        )

    async def delete(self, path: str) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None, self._client.remove_object, self._bucket, path
        )

    async def exists(self, path: str) -> bool:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, self._client.object_exists, self._bucket, path
        )


class _SyncMinioClient:
    """Thin sync wrapper around the MinIO client — nunca chamado direto de corrotinas."""

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

    def get_object(self, bucket: str, path: str) -> bytes:
        response = self._client.get_object(bucket, path)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def remove_object(self, bucket: str, path: str) -> None:
        self._client.remove_object(bucket, path)

    def object_exists(self, bucket: str, path: str) -> bool:
        try:
            self._client.stat_object(bucket, path)
            return True
        except Exception:
            return False


def get_storage_backend() -> StorageBackend:
    if settings.STORAGE_BACKEND == "minio":
        return MinioStorage()
    return LocalStorage()


storage = get_storage_backend()
