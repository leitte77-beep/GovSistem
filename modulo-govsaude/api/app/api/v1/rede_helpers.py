"""Apoio de idempotência das rotas da Fase 1."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.nucleo import Usuario
from app.services.idempotencia import buscar, chave_do_header, guardar, hash_requisicao


async def cache_idempotencia(
    request: Request,
    db: AsyncSession,
    tenant_id: uuid.UUID,
    corpo: dict[str, Any],
):
    chave = chave_do_header(request)
    request_hash = hash_requisicao(corpo)
    if not chave:
        return None, request_hash, None
    cache = await buscar(
        db,
        tenant_id=tenant_id,
        chave=chave,
        endpoint=request.url.path,
        request_hash=request_hash,
    )
    return chave, request_hash, cache


def resposta_cache(cache) -> JSONResponse:
    return JSONResponse(status_code=cache.response_status, content=cache.response_body)


async def gravar_idempotencia(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    chave: str | None,
    request: Request,
    request_hash: str,
    status: int,
    body: dict,
    usuario: Usuario | None,
) -> None:
    if not chave:
        return
    await guardar(
        db,
        tenant_id=tenant_id,
        chave=chave,
        endpoint=request.url.path,
        request_hash=request_hash,
        status=status,
        body=body,
        usuario=usuario,
    )
    await db.commit()
