"""Entrega de eventos em tempo real (§127).

O navegador abre um `EventSource` em `/eventos/stream`; este serviço é o lado que
empurra. Duas decisões valem registro:

- **O payload é um sinal, não a verdade.** Ele carrega o tipo do evento e o
  suficiente para o cliente decidir *o que* recarregar; o conteúdo e a
  autorização continuam vindo pelas rotas normais. Assim um evento publicado
  antes de um rollback não vaza dado — no máximo provoca um refetch que não
  encontra nada.
- **Redis é opcional.** O broker em processo atende o worker único do deploy
  padrão. Com `REALTIME_BACKEND=redis`, o publish também vai para o Redis e todo
  worker assina o canal do usuário, de modo que quem está em outro processo
  recebe. Sem Redis acessível, cai de volta para o broker local sem derrubar a
  aplicação.
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import AsyncIterator

from app.core.config import settings

logger = logging.getLogger("govtask.realtime")

# Um conjunto de filas por usuário: o mesmo usuário pode ter mais de uma aba
# aberta, e cada conexão precisa receber o evento.
_assinantes: dict[str, set[asyncio.Queue]] = {}
_redis = None
_redis_habilitado = False


def _canal(user_id: str) -> str:
    return f"govtask:user:{user_id}"


async def start() -> None:
    """Sobe o broker. Falha de Redis não impede a API de funcionar."""
    global _redis, _redis_habilitado
    if not settings.REALTIME_ENABLED:
        logger.info("tempo real desabilitado")
        return
    if settings.REALTIME_BACKEND != "redis":
        logger.info("tempo real em memória (um worker)")
        return
    try:
        from redis.asyncio import Redis

        _redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
        await _redis.ping()
        _redis_habilitado = True
        logger.info("tempo real com fan-out por Redis")
    except Exception:
        logger.warning("Redis indisponível; tempo real fica em memória", exc_info=True)
        _redis = None
        _redis_habilitado = False


async def stop() -> None:
    global _redis, _redis_habilitado
    if _redis is not None:
        try:
            await _redis.aclose()
        except Exception:
            logger.warning("falha ao fechar o Redis do tempo real", exc_info=True)
    _redis = None
    _redis_habilitado = False
    _assinantes.clear()


async def publish(user_id: uuid.UUID | str, evento: dict) -> None:
    """Publica um evento para todas as conexões de um usuário."""
    if not settings.REALTIME_ENABLED:
        return
    chave = str(user_id)
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        **(evento or {}),
    }
    if _redis_habilitado and _redis is not None:
        try:
            await _redis.publish(_canal(chave), json.dumps(payload))
            return
        except Exception:
            logger.warning("falha ao publicar no Redis; entregando localmente", exc_info=True)
    _entregar_local(chave, payload)


def _entregar_local(user_id: str, payload: dict) -> None:
    for fila in list(_assinantes.get(user_id, ())):
        try:
            fila.put_nowait(payload)
        except asyncio.QueueFull:
            # Assinante lento: descarta o sinal em vez de crescer sem limite. O
            # cliente volta a sincronizar pela API no próximo evento/polling.
            logger.warning("fila de tempo real cheia para %s; evento descartado", user_id)
        except Exception:
            logger.warning("falha ao entregar evento local", exc_info=True)


async def subscribe(user_id: uuid.UUID | str) -> AsyncIterator[dict]:
    """Gera os eventos de um usuário até a conexão cair."""
    chave = str(user_id)
    fila: asyncio.Queue = asyncio.Queue(maxsize=100)
    _assinantes.setdefault(chave, set()).add(fila)
    tarefa_redis = None

    if _redis_habilitado and _redis is not None:
        tarefa_redis = asyncio.create_task(_encaminhar_redis(chave, fila))

    try:
        while True:
            yield await fila.get()
    finally:
        if tarefa_redis is not None:
            tarefa_redis.cancel()
            try:
                await tarefa_redis
            except (asyncio.CancelledError, Exception):
                pass
        assinantes = _assinantes.get(chave)
        if assinantes is not None:
            assinantes.discard(fila)
            if not assinantes:
                _assinantes.pop(chave, None)


async def _encaminhar_redis(user_id: str, fila: asyncio.Queue) -> None:
    """Escuta o canal do usuário no Redis e joga na fila local."""
    pubsub = _redis.pubsub()
    try:
        await pubsub.subscribe(_canal(user_id))
        async for mensagem in pubsub.listen():
            if mensagem.get("type") != "message":
                continue
            try:
                fila.put_nowait(json.loads(mensagem["data"]))
            except asyncio.QueueFull:
                continue
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.warning("assinatura Redis encerrada para %s", user_id, exc_info=True)
    finally:
        try:
            await pubsub.aclose()
        except Exception:
            pass
