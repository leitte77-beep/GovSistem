"""Tempo real: Server-Sent Events com o que mudou na prefeitura.

O navegador abre `GET /eventos?token=...` (EventSource não envia cabeçalho
Authorization) e recebe:

    event: pedidos        {"pedidos": [{id, numero, titulo, situacao, ...}]}
    event: notificacoes   {"nao_lidas": 3}

A fonte é a coluna `ultima_movimentacao_em`, que toda escrita na timeline
atualiza (`services.pedidos.registrar`). Consultar a cada poucos segundos é
barato e funciona com qualquer número de workers — sem Redis, sem LISTEN.

Nenhuma conexão de banco fica presa durante o stream: cada volta abre e
fecha a própria sessão.
"""

import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select

from app.api.v1.painel import _visao_ampla
from app.core.auth import get_current_user
from app.core.database import async_session
from app.core.security import decode_saas_token, decode_token
from app.models.pedido import Pedido
from app.services import notificacoes as notif

router = APIRouter(tags=["eventos"])

INTERVALO = 4  # segundos entre consultas
PING = 20  # segundos entre comentários de keep-alive


def _expira_em(token: str) -> float | None:
    try:
        payload = decode_token(token)
    except Exception:
        payload = decode_saas_token(token) or {}
    exp = payload.get("exp")
    return float(exp) if exp else None


def _evento(nome: str, dados: dict) -> str:
    return f"event: {nome}\ndata: {json.dumps(dados, default=str)}\n\n"


@router.get("/eventos")
async def eventos(request: Request, token: str = Query(min_length=10, max_length=4096)):
    async with async_session() as db:
        user = await get_current_user(
            HTTPAuthorizationCredentials(scheme="Bearer", credentials=token), db
        )
    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    ampla = _visao_ampla(user)
    expira = _expira_em(token)
    org = user.organization_id

    async def fluxo():
        cursor = datetime.now(timezone.utc)
        nao_lidas_antes = -1
        ultimo_ping = 0.0
        yield "retry: 5000\n\n"
        yield _evento("conectado", {"agora": cursor.isoformat()})
        while True:
            if await request.is_disconnected():
                return
            relogio = asyncio.get_event_loop().time()
            if expira and datetime.now(timezone.utc).timestamp() >= expira:
                yield _evento("expirado", {})
                return
            try:
                async with async_session() as db:
                    linhas = (
                        await db.execute(
                            select(
                                Pedido.id,
                                Pedido.numero,
                                Pedido.titulo,
                                Pedido.situacao,
                                Pedido.setor_atual,
                                Pedido.ultima_movimentacao_em,
                            )
                            .where(
                                Pedido.organization_id == org,
                                Pedido.deleted_at.is_(None),
                                Pedido.ultima_movimentacao_em > cursor,
                            )
                            .order_by(Pedido.ultima_movimentacao_em)
                            .limit(50)
                        )
                    ).all()
                    nao_lidas = await notif.contar_nao_lidas(db, user)
            except Exception:
                # Banco oscilou: tenta de novo na próxima volta.
                await asyncio.sleep(INTERVALO)
                continue

            if linhas:
                cursor = max(l.ultima_movimentacao_em for l in linhas)
                pedidos = [
                    {
                        "id": str(l.id),
                        "numero": l.numero,
                        # O departamento não recebe título de pedido que não é dele.
                        "titulo": l.titulo if ampla else None,
                        "situacao": l.situacao,
                        "setor_atual": l.setor_atual,
                    }
                    for l in linhas
                ]
                yield _evento("pedidos", {"pedidos": pedidos})
            if nao_lidas != nao_lidas_antes:
                nao_lidas_antes = nao_lidas
                yield _evento("notificacoes", {"nao_lidas": nao_lidas})
            if relogio - ultimo_ping >= PING:
                ultimo_ping = relogio
                yield ": ping\n\n"
            await asyncio.sleep(INTERVALO)

    return StreamingResponse(
        fluxo(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            # Desliga o buffer do nginx (borda e módulo) para este stream.
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
