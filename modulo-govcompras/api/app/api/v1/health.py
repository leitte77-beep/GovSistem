"""Verificações de saúde do módulo (seção 120)."""

import time

from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.core.database import async_session

router = APIRouter(tags=["Saúde"])


async def _banco() -> dict:
    inicio = time.perf_counter()
    try:
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "ok", "latencia_ms": round((time.perf_counter() - inicio) * 1000, 2)}
    except Exception as erro:
        return {"status": "falha", "erro": erro.__class__.__name__}


@router.get("/health", summary="Saúde geral")
async def health():
    banco = await _banco()
    return {
        "status": "ok" if banco["status"] == "ok" else "degradado",
        "app": settings.APP_NAME,
        "versao": settings.VERSION,
        "ambiente": settings.APP_ENV,
        "servicos": {"banco": banco["status"]},
    }


@router.get("/health/live", summary="Processo no ar")
async def live():
    return {"status": "ok"}


@router.get("/health/ready", summary="Pronto para receber tráfego")
async def ready():
    banco = await _banco()
    return {"status": "pronto" if banco["status"] == "ok" else "indisponivel"}
