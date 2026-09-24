"""Verificações de saúde do módulo."""

import time

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import exigir
from app.core.config import settings
from app.core.database import get_db
from app.core.permissoes import P
from app.core.storage import get_storage
from app.models.organizacao import User

router = APIRouter(tags=["Saúde"])


async def _banco(db: AsyncSession) -> dict:
    inicio = time.perf_counter()
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "ok", "latencia_ms": round((time.perf_counter() - inicio) * 1000, 2)}
    except Exception as erro:
        return {"status": "falha", "erro": erro.__class__.__name__}


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
    except Exception as erro:
        return {"status": "falha", "backend": settings.STORAGE_BACKEND, "erro": erro.__class__.__name__}


@router.get("/health", summary="Saúde geral")
async def health(db: AsyncSession = Depends(get_db)):
    banco = await _banco(db)
    armazenamento = await _armazenamento()
    return {
        "status": "ok" if banco["status"] == "ok" and armazenamento["status"] == "ok" else "degradado",
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
    banco = await _banco(db)
    armazenamento = await _armazenamento()
    pronto = banco["status"] == "ok" and armazenamento["status"] in {"ok", "degradado"}
    return {"status": "pronto" if pronto else "indisponivel"}


@router.get("/admin/saude", summary="Painel técnico de saúde")
async def saude_detalhada(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CONFIGURACOES_VISUALIZAR)),
):
    redis = {"status": "nao_configurado"}
    if settings.REDIS_URL:
        try:
            import redis.asyncio as aioredis

            cliente = aioredis.from_url(settings.REDIS_URL)
            await cliente.ping()
            await cliente.aclose()
            redis = {"status": "ok"}
        except Exception as erro:
            redis = {"status": "falha", "erro": erro.__class__.__name__}

    return {
        "app": {
            "nome": settings.APP_NAME,
            "versao": settings.VERSION,
            "ambiente": settings.APP_ENV,
            "porta_api": settings.API_PORT,
            "porta_frontend": settings.FRONTEND_PORT,
            "modo_portas": settings.PORT_MODE,
        },
        "banco": await _banco(db),
        "armazenamento": await _armazenamento(),
        "redis": redis,
        "agendador": {
            "status": "ativo" if settings.SCHEDULER_ENABLED else "desligado",
            "intervalo_segundos": settings.SCHEDULER_INTERVAL_SECONDS,
        },
        "georreferenciamento": {
            "provedor": settings.GEOCODE_PROVIDER,
            "observacao": (
                "A indisponibilidade do provedor não impede o cadastro: "
                "a marcação manual do ponto no mapa é sempre aceita."
            ),
        },
    }
