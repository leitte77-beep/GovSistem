"""Backend MinIO (S3-compatible) — ativado por STORAGE_BACKEND=s3."""

import io
import uuid

from app.core.config import settings


def _client():
    from minio import Minio

    return Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY.get_secret_value(),
        secret_key=settings.MINIO_SECRET_KEY.get_secret_value(),
        secure=settings.MINIO_SECURE,
    )


def _key(tenant_id: uuid.UUID, storage_key: str) -> str:
    return f"{str(tenant_id).replace('-', '')}/{storage_key}"


async def salvar_minio(tenant_id: uuid.UUID, content: bytes, storage_key: str) -> str:
    client = _client()
    bucket = settings.MINIO_BUCKET
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
    client.put_object(
        bucket,
        _key(tenant_id, storage_key),
        io.BytesIO(content),
        length=len(content),
    )
    return storage_key


async def ler_minio(tenant_id: uuid.UUID, storage_key: str) -> bytes:
    client = _client()
    resp = client.get_object(settings.MINIO_BUCKET, _key(tenant_id, storage_key))
    try:
        return resp.read()
    finally:
        resp.close()
        resp.release_conn()
