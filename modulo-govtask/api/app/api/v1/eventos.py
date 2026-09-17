"""Stream de eventos em tempo real (§127).

Um `EventSource` do navegador não permite cabeçalho `Authorization`, então o
token vem por query string — a mesma validação do Bearer, sem abrir uma segunda
porta de autenticação. O token é de acesso curto; quem opera a borda deve evitar
registrar a query string nos logs de acesso.

O stream é unidirecional de propósito: o servidor avisa **que algo mudou**, e o
cliente recarrega pela API autorizada. Nada de conteúdo sensível trafegando por
um canal que não passa pelo mesmo escopo das rotas.
"""

import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.core.auth import get_user_from_token
from app.core.config import settings
from app.core.database import async_session
from app.services import realtime

logger = logging.getLogger("govtask.eventos")

router = APIRouter(prefix="/eventos", tags=["Tempo real"])

_CABECALHOS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    # Sem isto, um proxy com buffer segura o evento aberto e o tempo real some.
    "X-Accel-Buffering": "no",
}


def _formatar(nome: str, dados: dict) -> str:
    return f"event: {nome}\ndata: {json.dumps(dados, ensure_ascii=False)}\n\n"


@router.get("/stream")
async def stream(
    request: Request,
    token: str = Query(..., description="Token de acesso; o EventSource não envia cabeçalho"),
):
    if not settings.REALTIME_ENABLED:
        raise HTTPException(status_code=503, detail="Tempo real desabilitado neste ambiente")

    # Sessão curta só para autenticar. A sessão de `get_db` ficaria aberta
    # durante toda a conexão e prenderia uma conexão do pool por cliente.
    async with async_session() as db:
        user = await get_user_from_token(token, db)
    user_id = str(user.id)

    async def gerador():
        # Handshake explícito: o cliente sabe que a conexão valeu, e o proxy não
        # fecha uma resposta que ainda não escreveu nada.
        yield _formatar("conectado", {"user_id": user_id})

        assinatura = realtime.subscribe(user_id)
        try:
            while True:
                try:
                    evento = await asyncio.wait_for(
                        assinatura.__anext__(),
                        timeout=settings.REALTIME_HEARTBEAT_SEGUNDOS,
                    )
                except asyncio.TimeoutError:
                    # Heartbeat: mantém viva a conexão ociosa sem inventar evento.
                    yield _formatar("ping", {})
                    if await request.is_disconnected():
                        break
                    continue
                except StopAsyncIteration:
                    break
                if await request.is_disconnected():
                    break
                yield _formatar(evento.get("tipo", "evento"), evento)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("stream de eventos encerrado para %s", user_id, exc_info=True)
        finally:
            await assinatura.aclose()

    return StreamingResponse(gerador(), media_type="text/event-stream", headers=_CABECALHOS)
