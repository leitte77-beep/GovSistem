"""Armazenamento de objetos privados com chave opaca.

Nunca usar nome original, CPF, CNS ou diagnóstico no caminho. A chave segue
``tenant/<uuid>/<ano>/<uuid>`` e os objetos são servidos por URL pré-assinada
curta (MinIO/S3) ou por download autenticado no backend local.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import settings


class Storage:
    def __init__(self) -> None:
        self.backend = settings.STORAGE_BACKEND.lower()

    @staticmethod
    def chave_opaca(tenant_id: uuid.UUID, extensao: str | None = None) -> str:
        ano = datetime.now(timezone.utc).year
        sufixo = f".{extensao.lstrip('.')}" if extensao else ""
        return f"tenant/{tenant_id}/{ano}/{uuid.uuid4().hex}{sufixo}"

    async def put(self, chave: str, conteudo: bytes, content_type: str | None = None) -> None:
        if self.backend == "s3":
            await asyncio.to_thread(self._put_s3, chave, conteudo, content_type)
            return
        destino = Path(settings.STORAGE_LOCAL_PATH) / chave
        destino.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(destino.write_bytes, conteudo)

    async def get(self, chave: str) -> bytes:
        if self.backend == "s3":
            return await asyncio.to_thread(self._get_s3, chave)
        return await asyncio.to_thread((Path(settings.STORAGE_LOCAL_PATH) / chave).read_bytes)

    async def delete(self, chave: str) -> None:
        if self.backend == "s3":
            await asyncio.to_thread(self._delete_s3, chave)
            return
        destino = Path(settings.STORAGE_LOCAL_PATH) / chave
        if destino.exists():
            await asyncio.to_thread(destino.unlink)

    async def url_temporaria(self, chave: str, segundos: int | None = None) -> str | None:
        if self.backend != "s3":
            return None
        return await asyncio.to_thread(
            self._url_s3, chave, segundos or settings.S3_SIGNED_URL_TTL_SECONDS
        )

    def _client(self):
        from minio import Minio

        return Minio(
            settings.S3_ENDPOINT,
            access_key=settings.S3_ACCESS_KEY.get_secret_value(),
            secret_key=settings.S3_SECRET_KEY.get_secret_value(),
            secure=settings.S3_ENDPOINT.startswith("https://"),
        )

    def _put_s3(self, chave: str, conteudo: bytes, content_type: str | None) -> None:
        from io import BytesIO

        cliente = self._client()
        cliente.put_object(
            settings.S3_BUCKET,
            chave,
            BytesIO(conteudo),
            length=len(conteudo),
            content_type=content_type or "application/octet-stream",
        )

    def _get_s3(self, chave: str) -> bytes:
        resposta = self._client().get_object(settings.S3_BUCKET, chave)
        try:
            return resposta.read()
        finally:
            resposta.close()
            resposta.release_conn()

    def _delete_s3(self, chave: str) -> None:
        self._client().remove_object(settings.S3_BUCKET, chave)

    def _url_s3(self, chave: str, segundos: int) -> str:
        from datetime import timedelta

        return self._client().presigned_get_object(
            settings.S3_BUCKET, chave, expires=timedelta(seconds=segundos)
        )


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        _storage = Storage()
    return _storage
