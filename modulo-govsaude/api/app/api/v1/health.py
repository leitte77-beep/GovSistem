"""Saúde do módulo (healthcheck do container e prontidão)."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.storage import get_storage

router = APIRouter(tags=["Saúde"])


async def _banco(db: AsyncSession) -> dict:
    inicio = time.perf_counter()
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "ok", "latencia_ms": round((time.perf_counter() - inicio) * 1000, 2)}
    except Exception as exc:  # noqa: BLE001
        return {"status": "falha", "erro": exc.__class__.__name__}


async def _armazenamento() -> dict:
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
    except Exception as exc:  # noqa: BLE001
        return {
            "status": "falha",
            "backend": settings.STORAGE_BACKEND,
            "erro": exc.__class__.__name__,
        }


@router.get("/health", summary="Saúde geral")
async def health(db: AsyncSession = Depends(get_db)):
    banco = await _banco(db)
    armazenamento = await _armazenamento()
    saudavel = banco["status"] == "ok" and armazenamento["status"] == "ok"
    return {
        "status": "ok" if saudavel else "degradado",
        "app": settings.APP_NAME,
        "versao": settings.VERSION,
        "ambiente": settings.APP_ENV,
        "servicos": {
            "banco": banco["status"],
            "armazenamento": armazenamento["status"],
        },
    }


@router.get("/health/live", summary="Processo no ar")
async def live():
    return {"status": "ok"}


@router.get("/health/ready", summary="Pronto para receber tráfego")
async def ready(db: AsyncSession = Depends(get_db)):
    banco = await _banco(db)
    armazenamento = await _armazenamento()
    pronto = banco["status"] == "ok" and armazenamento["status"] in {"ok", "degradado"}
    return {"status": "pronto" if pronto else "indisponivel"}
