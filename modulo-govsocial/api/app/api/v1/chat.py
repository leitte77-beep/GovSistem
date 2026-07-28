"""
Chat interno via WebSocket com Redis pub/sub.

Requisitos edital (XLIV-L):
- XLIV: Chat online dentro da aplicação
- XLV: Conexão criptografada (WSS via Nginx)
- XLVI: Full-duplex via único socket TCP (WebSocket)
- XLVII: Sem armazenamento — mensagens só existem na sessão
- XLVIII: Ativável/desativável via organization.settings
- XLIX: Atualização automática de pendências
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.redis import get_redis

logger = logging.getLogger("govsocial.chat")

router = APIRouter(tags=["chat"])

CHANNEL_PREFIX = "chat:tenant:"


class ConnectionManager:
    """Gerencia conexões WebSocket ativas por tenant e usuário."""

    def __init__(self):
        self._connections: dict[str, dict[str, WebSocket]] = {}

    async def connect(self, tenant_id: str, user_id: str, user_name: str, ws: WebSocket):
        await ws.accept()
        if tenant_id not in self._connections:
            self._connections[tenant_id] = {}
        self._connections[tenant_id][user_id] = ws
        await self._broadcast_presence(tenant_id, user_id, user_name, "online")
        logger.debug("Chat: %s conectado no tenant %s", user_name, tenant_id)

    async def disconnect(self, tenant_id: str, user_id: str, user_name: str):
        if tenant_id in self._connections:
            self._connections[tenant_id].pop(user_id, None)
            if not self._connections[tenant_id]:
                del self._connections[tenant_id]
        await self._broadcast_presence(tenant_id, user_id, user_name, "offline")

    async def send_to_user(self, tenant_id: str, user_id: str, message: dict):
        ws = self._connections.get(tenant_id, {}).get(user_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception:
                pass

    async def broadcast_to_tenant(self, tenant_id: str, message: dict):
        for ws in self._connections.get(tenant_id, {}).values():
            try:
                await ws.send_json(message)
            except Exception:
                pass

    def get_online_users(self, tenant_id: str) -> list[str]:
        return list(self._connections.get(tenant_id, {}).keys())

    async def _broadcast_presence(self, tenant_id: str, user_id: str, user_name: str, status: str):
        await self.broadcast_to_tenant(tenant_id, {
            "type": "presence",
            "user_id": user_id,
            "user_name": user_name,
            "status": status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })


manager = ConnectionManager()


def _extract_token(ws: WebSocket) -> Optional[str]:
    """Extrai JWT do header Authorization, subprotocolo ou query string."""
    auth = ws.headers.get("authorization") or ws.headers.get("sec-websocket-protocol")
    if auth:
        for part in (p.strip() for p in auth.split(",")):
            if part.lower().startswith("bearer "):
                return part[7:].strip()
            if "." in part and part.count(".") == 2:
                return part

    token = ws.query_params.get("token")
    if token:
        return token
    return None


@router.websocket("/ws/chat/{tenant_id}")
async def chat_websocket(ws: WebSocket, tenant_id: str):
    """WebSocket principal do chat. Autentica via token JWT via header."""

    origin = ws.headers.get("origin", "")
    if origin and origin not in settings.CORS_ORIGINS:
        await ws.close(code=4003, reason=f"Origin '{origin}' nao permitido")
        return

    token = _extract_token(ws)
    if not token:
        await ws.close(code=4001, reason="Token ausente")
        return

    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY.get_secret_value(),
            algorithms=[settings.ALGORITHM],
        )
    except Exception:
        saas_secret = settings.SAAS_JWT_SECRET.get_secret_value()
        if saas_secret:
            try:
                payload = jwt.decode(
                    token, saas_secret,
                    algorithms=[settings.ALGORITHM],
                )
            except Exception:
                await ws.close(code=4001, reason="Token inválido")
                return
        else:
            await ws.close(code=4001, reason="Token inválido")
            return

    user_id = payload.get("sub")
    user_name = payload.get("name", user_id)
    if not user_id:
        await ws.close(code=4001, reason="Token sem sub")
        return

    redis = await get_redis()
    if redis is None:
        await ws.close(code=4002, reason="Serviço indisponível")
        return

    await manager.connect(tenant_id, user_id, user_name, ws)

    channel = f"{CHANNEL_PREFIX}{tenant_id}"
    pubsub = redis.pubsub(ignore_subscribe_messages=True)
    await pubsub.subscribe(channel)

    async def redis_listener():
        """Escuta mensagens do Redis e envia para o WebSocket."""
        try:
            async for msg in pubsub.listen():
                if msg["type"] == "message":
                    data = json.loads(msg["data"])
                    if data.get("user_id") != user_id:
                        await ws.send_json(data)
        except Exception:
            pass

    try:
        import asyncio
        listener_task = asyncio.create_task(redis_listener())

        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)
            msg_type = data.get("type", "message")

            if msg_type == "typing":
                await manager.broadcast_to_tenant(tenant_id, {
                    "type": "typing",
                    "user_id": user_id,
                    "user_name": user_name,
                })
            elif msg_type == "message":
                text = data.get("text", "")
                if len(text) > 5000:
                    continue
                message = {
                    "type": "message",
                    "user_id": user_id,
                    "user_name": user_name,
                    "text": text,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                await redis.publish(channel, json.dumps(message))
                await ws.send_json(message)

        listener_task.cancel()
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.exception("Erro no chat WebSocket: %s", exc)
    finally:
        await pubsub.unsubscribe(channel)
        await manager.disconnect(tenant_id, user_id, user_name)
