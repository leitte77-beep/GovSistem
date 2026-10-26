"""Idempotência de POST (``Idempotency-Key``).

A chave é escopada por tenant + endpoint. Repetir a mesma requisição devolve a
mesma resposta; reutilizar a chave com corpo diferente é conflito 409.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import timedelta, timezone
from typing import Any

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict
from app.core.security import agora
from app.models.nucleo import IdempotencyKey, Usuario

TTL_HORAS = 24


def chave_do_header(request: Request) -> str | None:
    valor = request.headers.get("Idempotency-Key")
    if not valor:
        return None
    if len(valor) > 80:
        raise Conflict("Idempotency-Key excede 80 caracteres.", code="idempotency_invalida")
    return valor


def hash_requisicao(corpo: Any) -> str:
    serializado = json.dumps(corpo, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(serializado.encode("utf-8")).hexdigest()


async def buscar(
    db: AsyncSession, *, tenant_id: uuid.UUID, chave: str, endpoint: str, request_hash: str
) -> IdempotencyKey | None:
    registro = await db.scalar(
        select(IdempotencyKey).where(
            IdempotencyKey.tenant_id == tenant_id,
            IdempotencyKey.chave == chave,
            IdempotencyKey.endpoint == endpoint,
        )
    )
    if registro is None:
        return None
    if registro.request_hash != request_hash:
        raise Conflict(
            "Esta Idempotency-Key já foi usada com um corpo diferente.",
            code="idempotency_conflito",
        )
    expira = registro.expires_at
    if expira.tzinfo is None:
        expira = expira.replace(tzinfo=timezone.utc)
    if expira < agora():
        await db.delete(registro)
        await db.flush()
        return None
    return registro


async def guardar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    chave: str,
    endpoint: str,
    request_hash: str,
    status: int,
    body: dict,
    usuario: Usuario | None = None,
) -> IdempotencyKey:
    registro = IdempotencyKey(
        tenant_id=tenant_id,
        usuario_id=usuario.id if usuario else None,
        chave=chave,
        endpoint=endpoint,
        request_hash=request_hash,
        response_status=status,
        response_body=body,
        expires_at=agora() + timedelta(hours=TTL_HORAS),
    )
    db.add(registro)
    await db.flush()
    return registro
