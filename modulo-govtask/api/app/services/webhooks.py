"""Webhooks de saída (§196).

Duas etapas, de propósito:

1. **Enfileirar** — dentro da transação da timeline, só grava `webhook_entregas`
   como PENDENTE. Não toca na rede: uma API externa lenta não pode segurar a
   conclusão de uma tarefa.
2. **Processar** — um endpoint administrativo (ou o agendador) entrega as
   pendentes com assinatura HMAC-SHA256 e registra o resultado. Reprocessar é
   idempotente: só entram as que ainda não tiveram sucesso e não estouraram as
   tentativas.
"""

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.enums import StatusWebhookEntrega
from app.models.webhook import WebhookEndpoint, WebhookEntrega

LIMITE_RESPOSTA = 500


async def enfileirar_evento(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    evento: str,
    payload: dict,
    demanda_id: uuid.UUID | None = None,
) -> int:
    """Cria as entregas pendentes para os endpoints que assinam o evento."""
    if not settings.WEBHOOKS_ENABLED:
        return 0
    endpoints = (
        (
            await db.execute(
                select(WebhookEndpoint).where(
                    WebhookEndpoint.organization_id == organization_id,
                    WebhookEndpoint.ativo.is_(True),
                    WebhookEndpoint.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    criadas = 0
    for endpoint in endpoints:
        assinados = endpoint.eventos or []
        if assinados and evento not in assinados:
            continue
        db.add(
            WebhookEntrega(
                organization_id=organization_id,
                endpoint_id=endpoint.id,
                evento=evento,
                demanda_id=demanda_id,
                payload=payload,
                status=StatusWebhookEntrega.PENDENTE,
            )
        )
        criadas += 1
    return criadas


def _assinar(secret: str, corpo: bytes, timestamp: str) -> str:
    mensagem = f"{timestamp}.".encode() + corpo
    return hmac.new(secret.encode(), mensagem, hashlib.sha256).hexdigest()


async def processar_pendentes(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID | None = None,
    limite: int = 50,
) -> dict:
    """Tenta entregar as pendentes/falhadas dentro do limite de tentativas."""
    stmt = (
        select(WebhookEntrega)
        .join(WebhookEndpoint, WebhookEndpoint.id == WebhookEntrega.endpoint_id)
        .where(
            WebhookEntrega.status.in_(
                [StatusWebhookEntrega.PENDENTE, StatusWebhookEntrega.FALHA]
            ),
            WebhookEntrega.tentativas < settings.WEBHOOK_MAX_TENTATIVAS,
            WebhookEndpoint.ativo.is_(True),
            WebhookEndpoint.deleted_at.is_(None),
        )
        .order_by(WebhookEntrega.created_at)
        .limit(limite)
        .options()
    )
    if organization_id is not None:
        stmt = stmt.where(WebhookEntrega.organization_id == organization_id)
    entregas = (await db.execute(stmt)).scalars().all()

    resultado = {"processadas": 0, "sucesso": 0, "falha": 0}
    for entrega in entregas:
        endpoint = await db.get(WebhookEndpoint, entrega.endpoint_id)
        resultado["processadas"] += 1
        entrega.tentativas += 1
        corpo = json.dumps(
            {"evento": entrega.evento, "demanda_id": str(entrega.demanda_id) if entrega.demanda_id else None,
             "dados": entrega.payload},
            ensure_ascii=False,
            default=str,
        ).encode()
        timestamp = str(int(datetime.now(timezone.utc).timestamp()))
        try:
            async with httpx.AsyncClient(timeout=settings.WEBHOOK_TIMEOUT_SEGUNDOS) as cliente:
                resposta = await cliente.post(
                    endpoint.url,
                    content=corpo,
                    headers={
                        "Content-Type": "application/json",
                        "X-GovTask-Event": entrega.evento,
                        "X-GovTask-Delivery": str(entrega.id),
                        "X-GovTask-Timestamp": timestamp,
                        "X-GovTask-Signature": _assinar(endpoint.secret, corpo, timestamp),
                    },
                )
            entrega.http_status = resposta.status_code
            entrega.resposta = resposta.text[:LIMITE_RESPOSTA]
            if 200 <= resposta.status_code < 300:
                entrega.status = StatusWebhookEntrega.SUCESSO
                entrega.entregue_em = datetime.now(timezone.utc)
                entrega.erro = None
                endpoint.ultima_entrega_em = entrega.entregue_em
                endpoint.ultimo_status = StatusWebhookEntrega.SUCESSO.value
                resultado["sucesso"] += 1
            else:
                entrega.status = StatusWebhookEntrega.FALHA
                entrega.erro = f"HTTP {resposta.status_code}"
                endpoint.ultimo_status = StatusWebhookEntrega.FALHA.value
                resultado["falha"] += 1
        except Exception as exc:  # noqa: BLE001 — falha de rede nunca derruba o lote
            entrega.status = StatusWebhookEntrega.FALHA
            entrega.erro = str(exc)[:LIMITE_RESPOSTA]
            endpoint.ultimo_status = StatusWebhookEntrega.FALHA.value
            resultado["falha"] += 1

        if (
            entrega.status == StatusWebhookEntrega.FALHA
            and entrega.tentativas >= settings.WEBHOOK_MAX_TENTATIVAS
        ):
            entrega.status = StatusWebhookEntrega.DESCARTADO

    await db.flush()
    return resultado
