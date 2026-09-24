"""Camada de armazenamento de arquivos do GovInfra.

Dois backends com a mesma interface:
  * `local` — diretório privado do servidor (padrão de desenvolvimento);
  * `s3`    — qualquer serviço compatível com S3 (MinIO, R2, AWS).

Nenhum dos dois expõe URL pública permanente: o download passa sempre pela API
autenticada, que registra quem baixou o quê. O caminho interno do servidor
nunca é devolvido ao cliente — só o identificador do arquivo.
"""

import asyncio
import logging
import os
from abc import ABC, abstractmethod
from collections.abc import Iterator

from app.core.config import settings

logger = logging.getLogger("govinfra.storage")

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


class LocalStorage(StorageBackend):
    def __init__(self, base_path: str | None = None):
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
        # Arquivo enviado por usuário nunca precisa de bit de execução.
        os.chmod(tmp, 0o640)
        os.replace(tmp, full)

    async def get(self, key: str) -> bytes:
        full = self._full(key)

        def _read() -> bytes:
            with open(full, "rb") as fh:
                return fh.read()

        return await asyncio.get_running_loop().run_in_executor(None, _read)

    async def delete(self, key: str) -> None:
        try:
            os.remove(self._full(key))
        except FileNotFoundError:
            pass

    async def exists(self, key: str) -> bool:
        return os.path.exists(self._full(key))

    def stream(self, key: str) -> Iterator[bytes]:
        with open(self._full(key), "rb") as fh:
            while True:
                pedaco = fh.read(CHUNK_SIZE)
                if not pedaco:
                    break
                yield pedaco


class S3Storage(StorageBackend):
    def __init__(self):
        import boto3
        from botocore.client import Config

        self.bucket = settings.S3_BUCKET
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT or None,
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY.get_secret_value(),
            aws_secret_access_key=settings.S3_SECRET_KEY.get_secret_value(),
            config=Config(
                s3={"addressing_style": "path" if settings.S3_FORCE_PATH_STYLE else "auto"},
                signature_version="s3v4",
            ),
        )

    async def _exec(self, func, *args, **kwargs):
        return await asyncio.get_running_loop().run_in_executor(
            None, lambda: func(*args, **kwargs)
        )

    async def put(self, key: str, data: bytes) -> None:
        await self._exec(self._client.put_object, Bucket=self.bucket, Key=key, Body=data)

    async def get(self, key: str) -> bytes:
        objeto = await self._exec(self._client.get_object, Bucket=self.bucket, Key=key)
        return objeto["Body"].read()

    async def delete(self, key: str) -> None:
        await self._exec(self._client.delete_object, Bucket=self.bucket, Key=key)

    async def exists(self, key: str) -> bool:
        try:
            await self._exec(self._client.head_object, Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False

    def stream(self, key: str) -> Iterator[bytes]:
        objeto = self._client.get_object(Bucket=self.bucket, Key=key)
        corpo = objeto["Body"]
        while True:
            pedaco = corpo.read(CHUNK_SIZE)
            if not pedaco:
                break
            yield pedaco


_backend: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _backend
    if _backend is None:
        if settings.STORAGE_BACKEND.lower() == "s3":
            _backend = S3Storage()
            logger.info("Armazenamento S3 em uso (bucket=%s)", settings.S3_BUCKET)
        else:
            _backend = LocalStorage()
            logger.info("Armazenamento local em uso (%s)", settings.STORAGE_LOCAL_PATH)
    return _backend


def reset_storage() -> None:
    """Usado pela suíte de testes para trocar de diretório entre execuções."""
    global _backend
    _backend = None
