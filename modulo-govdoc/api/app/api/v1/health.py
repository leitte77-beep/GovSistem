"""Verificações de saúde (públicas e administrativas)."""

import os
import shutil
import time
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_profiles
from app.core.config import settings
from app.core.database import get_db
from app.core.storage import get_storage
from app.models.enums import Profile
from app.models.governance import BackupExecution
from app.models.user import User

router = APIRouter(tags=["Saúde"])


async def _check_database(db: AsyncSession) -> dict:
    inicio = time.perf_counter()
    try:
        await db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "latencia_ms": round((time.perf_counter() - inicio) * 1000, 2),
        }
    except Exception as exc:
        return {"status": "falha", "erro": exc.__class__.__name__}


async def _check_storage() -> dict:
    try:
        storage = get_storage()
        chave = ".healthcheck/probe"
        await storage.put(chave, b"ok")
        conteudo = await storage.get(chave)
        await storage.delete(chave)
        return {
            "status": "ok" if conteudo == b"ok" else "degradado",
            "backend": settings.STORAGE_BACKEND,
        }
    except Exception as exc:
        return {
            "status": "falha",
            "backend": settings.STORAGE_BACKEND,
            "erro": exc.__class__.__name__,
        }


async def _check_redis() -> dict:
    if not settings.REDIS_URL:
        return {"status": "nao_configurado"}
    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(settings.REDIS_URL)
        await client.ping()
        await client.aclose()
        return {"status": "ok"}
    except Exception as exc:
        return {"status": "falha", "erro": exc.__class__.__name__}


def _check_backup_destination() -> dict:
    destino = settings.BACKUP_DESTINATION
    if not settings.BACKUP_ENABLED:
        return {"status": "desabilitado"}
    if not destino:
        return {"status": "nao_configurado"}
    if destino.startswith("s3://"):
        return {"status": "remoto", "destino": destino}
    try:
        os.makedirs(destino, exist_ok=True)
        uso = shutil.disk_usage(destino)
        return {
            "status": "ok",
            "destino": destino,
            "espaco_livre_bytes": uso.free,
        }
    except OSError as exc:
        return {"status": "falha", "erro": exc.__class__.__name__}


@router.get("/health", summary="Saúde geral")
async def health(db: AsyncSession = Depends(get_db)):
    banco = await _check_database(db)
    armazenamento = await _check_storage()
    status = (
        "ok"
        if banco["status"] == "ok" and armazenamento["status"] == "ok"
        else "degradado"
    )
    return {
        "status": status,
        "app": settings.APP_NAME,
        "versao": settings.VERSION,
        "ambiente": settings.APP_ENV,
        "servicos": {"banco": banco["status"], "armazenamento": armazenamento["status"]},
    }


@router.get("/health/live", summary="Processo no ar")
async def live():
    return {"status": "ok"}


@router.get("/health/ready", summary="Pronto para receber tráfego")
async def ready(db: AsyncSession = Depends(get_db)):
    banco = await _check_database(db)
    armazenamento = await _check_storage()
    pronto = banco["status"] == "ok" and armazenamento["status"] in {"ok", "degradado"}
    return {"status": "pronto" if pronto else "indisponivel"}


@router.get("/admin/saude", summary="Painel de saúde dos serviços")
async def detailed_health(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_profiles(Profile.ADMIN_GERAL)),
):
    ultimo_backup: Optional[BackupExecution] = await db.scalar(
        select(BackupExecution)
        .order_by(BackupExecution.started_at.desc().nullslast())
        .limit(1)
    )
    return {
        "app": {
            "nome": settings.APP_NAME,
            "versao": settings.VERSION,
            "ambiente": settings.APP_ENV,
            "porta_api": settings.API_PORT,
            "modo_portas": settings.PORT_MODE,
        },
        "banco": await _check_database(db),
        "armazenamento": await _check_storage(),
        "redis": await _check_redis(),
        "agendador": {
            "status": "ativo" if settings.SCHEDULER_ENABLED else "desligado",
            "intervalo_segundos": settings.SCHEDULER_INTERVAL_SECONDS,
        },
        "backup": {
            **_check_backup_destination(),
            "ultima_execucao": (
                {
                    "id": str(ultimo_backup.id),
                    "situacao": ultimo_backup.status,
                    "quando": ultimo_backup.started_at,
                    "verificado_em": ultimo_backup.verified_at,
                }
                if ultimo_backup
                else None
            ),
        },
        "antivirus": {
            "habilitado": settings.ANTIVIRUS_ENABLED,
            "modo": "clamav" if settings.CLAMAV_HOST else "heuristica_local",
        },
        "ocr": {
            "extracao_texto": settings.TEXT_EXTRACTION_ENABLED,
            "ocr": settings.OCR_ENABLED,
        },
    }
