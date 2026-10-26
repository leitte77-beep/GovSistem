"""SSE para filas e painéis de chamada (Redis pub/sub)."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id
from app.core.autorizacao import escopo_permite, exigir
from app.core.config import settings
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.core.redis import canal_tenant, get_redis
from app.models.nucleo import Usuario
from app.services.agenda_comum import obter_setor_da_unidade

router = APIRouter(prefix="/tempo-real", tags=["Tempo real"])


@router.get("/filas", summary="Eventos de fila e painel (SSE)")
async def filas(
    request: Request,
    estabelecimento_id: uuid.UUID = Query(...),
    setor_id: uuid.UUID = Query(...),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.FILA_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-045 — eventos de fila/painel em tempo real."""
    if not escopo_permite(
        usuario, Permissao.FILA_LER, estabelecimento_id=estabelecimento_id
    ):
        # Não confirmar existência do setor de outro estabelecimento.
        from app.core.errors import NotFound

        raise NotFound("Fila não encontrada.")
    await obter_setor_da_unidade(db, tenant_id, estabelecimento_id, setor_id)

    canal = canal_tenant(str(tenant_id), str(estabelecimento_id), str(setor_id))

    async def gerar() -> AsyncIterator[str]:
        yield "event: conectado\ndata: {\"status\":\"ok\"}\n\n"
        pubsub = None
        try:
            if settings.redis_url:
                pubsub = get_redis().pubsub()
                await pubsub.subscribe(canal)
            while True:
                if await request.is_disconnected():
                    break
                if pubsub is not None:
                    mensagem = await pubsub.get_message(
                        ignore_subscribe_messages=True,
                        timeout=settings.SSE_HEARTBEAT_SECONDS,
                    )
                    if mensagem and mensagem.get("type") == "message":
                        dados = mensagem.get("data")
                        if isinstance(dados, bytes):
                            dados = dados.decode("utf-8")
                        yield f"event: fila\ndata: {dados}\n\n"
                        continue
                else:
                    await asyncio.sleep(settings.SSE_HEARTBEAT_SECONDS)
                yield ": ping\n\n"
        finally:
            if pubsub is not None:
                await pubsub.unsubscribe(canal)
                await pubsub.aclose()

    return StreamingResponse(
        gerar(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
