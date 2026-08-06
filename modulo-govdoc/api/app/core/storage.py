"""Camada de armazenamento de arquivos.

Dois backends com a mesma interface:
  * `local`  — diretório privado do servidor (padrão de desenvolvimento);
  * `s3`     — qualquer serviço compatível com S3 (MinIO, R2, B2, Wasabi, AWS).

Nenhum dos dois expõe URL pública permanente: o download passa sempre pela API
autenticada (streaming) ou por URL assinada de curta duração.
"""

import asyncio
import logging
import os
import shutil
from abc import ABC, abstractmethod
from typing import AsyncIterator, Iterator, Optional

from app.core.config import settings

logger = logging.getLogger("govdoc.storage")

CHUNK_SIZE = 1024 * 1024


class StorageBackend(ABC):
    @abstractmethod
    async def put(self, key: str, data: bytes) -> None: ...

    @abstractmethod
    async def get(self, key: str) -> bytes: ...

    @abstractmethod
    async def delete(self, key: str) -> None: ...

    @abstractmethod
    async def exists(self, key: str) -> bool: ...

    @abstractmethod
    def stream(self, key: str) -> Iterator[bytes]: ...

    @abstractmethod
    async def size(self, key: str) -> int: ...

    async def presigned_url(self, key: str, filename: str) -> Optional[str]:
        return None

    async def copy(self, source_key: str, dest_key: str) -> None:
        data = await self.get(source_key)
        await self.put(dest_key, data)


class LocalStorage(StorageBackend):
    def __init__(self, base_path: Optional[str] = None):
        self.base_path = os.path.abspath(base_path or settings.STORAGE_LOCAL_PATH)
        os.makedirs(self.base_path, exist_ok=True)

    def _full(self, key: str) -> str:
        # Proteção contra path traversal: o caminho final tem que continuar
        # dentro da raiz de armazenamento.
        full = os.path.abspath(os.path.join(self.base_path, key))
        if not full.startswith(self.base_path + os.sep) and full != self.base_path:
            raise ValueError("Chave de armazenamento inválida")
        return full

    async def put(self, key: str, data: bytes) -> None:
        full = self._full(key)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        await asyncio.get_running_loop().run_in_executor(None, self._write, full, data)

    @staticmethod
    def _write(full: str, data: bytes) -> None:
        tmp = full + ".part"
        with open(tmp, "wb") as fh:
            fh.write(data)
        os.replace(tmp, full)

    async def get(self, key: str) -> bytes:
        full = self._full(key)
        return await asyncio.get_running_loop().run_in_executor(None, self._read, full)

    @staticmethod
    def _read(full: str) -> bytes:
        with open(full, "rb") as fh:
            return fh.read()

    async def delete(self, key: str) -> None:
        full = self._full(key)
        if os.path.exists(full):
            await asyncio.get_running_loop().run_in_executor(None, os.remove, full)

    async def exists(self, key: str) -> bool:
        return await asyncio.get_running_loop().run_in_executor(
            None, os.path.exists, self._full(key)
        )

    async def size(self, key: str) -> int:
        full = self._full(key)
        if not os.path.exists(full):
            return 0
        return os.path.getsize(full)

    def stream(self, key: str) -> Iterator[bytes]:
        full = self._full(key)
        with open(full, "rb") as fh:
            while True:
                chunk = fh.read(CHUNK_SIZE)
                if not chunk:
                    break
                yield chunk

    async def copy(self, source_key: str, dest_key: str) -> None:
        src, dst = self._full(source_key), self._full(dest_key)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        await asyncio.get_running_loop().run_in_executor(None, shutil.copyfile, src, dst)


class S3Storage(StorageBackend):
    """Compatível com MinIO e demais serviços S3. Bucket sempre privado."""

    def __init__(self):
        import boto3
        from botocore.config import Config

        self.bucket = settings.S3_BUCKET
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT or None,
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY.get_secret_value() or None,
            aws_secret_access_key=settings.S3_SECRET_KEY.get_secret_value() or None,
            config=Config(
                s3={"addressing_style": "path" if settings.S3_FORCE_PATH_STYLE else "auto"},
                signature_version="s3v4",
                retries={"max_attempts": 3, "mode": "standard"},
            ),
        )

    async def _run(self, fn, *args, **kwargs):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, lambda: fn(*args, **kwargs))

    def ensure_bucket(self) -> None:
        from botocore.exceptions import ClientError

        try:
            self._client.head_bucket(Bucket=self.bucket)
        except ClientError:
            self._client.create_bucket(Bucket=self.bucket)
            logger.info("Bucket %s criado", self.bucket)

    async def put(self, key: str, data: bytes) -> None:
        await self._run(self._client.put_object, Bucket=self.bucket, Key=key, Body=data)

    async def get(self, key: str) -> bytes:
        obj = await self._run(self._client.get_object, Bucket=self.bucket, Key=key)
        return obj["Body"].read()

    async def delete(self, key: str) -> None:
        await self._run(self._client.delete_object, Bucket=self.bucket, Key=key)

    async def exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            await self._run(self._client.head_object, Bucket=self.bucket, Key=key)
            return True
        except ClientError:
            return False

    async def size(self, key: str) -> int:
        from botocore.exceptions import ClientError

        try:
            head = await self._run(self._client.head_object, Bucket=self.bucket, Key=key)
            return int(head.get("ContentLength", 0))
        except ClientError:
            return 0

    def stream(self, key: str) -> Iterator[bytes]:
        obj = self._client.get_object(Bucket=self.bucket, Key=key)
        body = obj["Body"]
        while True:
            chunk = body.read(CHUNK_SIZE)
            if not chunk:
                break
            yield chunk

    async def presigned_url(self, key: str, filename: str) -> Optional[str]:
        return await self._run(
            self._client.generate_presigned_url,
            "get_object",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "ResponseContentDisposition": f'attachment; filename="{filename}"',
            },
            ExpiresIn=settings.S3_SIGNED_URL_TTL_SECONDS,
        )

    async def copy(self, source_key: str, dest_key: str) -> None:
        await self._run(
            self._client.copy_object,
            Bucket=self.bucket,
            CopySource={"Bucket": self.bucket, "Key": source_key},
            Key=dest_key,
        )


_backend: Optional[StorageBackend] = None


def get_storage() -> StorageBackend:
    global _backend
    if _backend is None:
        if settings.STORAGE_BACKEND.lower() == "s3":
            _backend = S3Storage()
        else:
            _backend = LocalStorage()
    return _backend


def reset_storage() -> None:
    """Usado pelos testes para trocar o backend entre execuções."""
    global _backend
    _backend = None


async def iter_file(key: str) -> AsyncIterator[bytes]:
    """Streaming assíncrono sem carregar o arquivo inteiro na memória."""
    storage = get_storage()
    loop = asyncio.get_running_loop()
    iterator = await loop.run_in_executor(None, lambda: storage.stream(key))
    while True:
        chunk = await loop.run_in_executor(None, lambda: next(iterator, None))
        if chunk is None:
            break
        yield chunk


def build_storage_key(
    institution_id, document_id, version_id, unique: str
) -> str:
    """Chave física — nunca usa o nome original do arquivo."""
    return (
        f"institution/{institution_id}/documents/{document_id}"
        f"/versions/{version_id}/{unique}"
    )


def build_quarantine_key(request_id, upload_id, unique: str) -> str:
    return f"quarantine/{request_id}/{upload_id}/{unique}"
