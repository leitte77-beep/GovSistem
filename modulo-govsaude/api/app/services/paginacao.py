"""Paginação por cursor compartilhada pela Fase 1."""

from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime

from sqlalchemy import tuple_


def decodificar(cursor: str | None) -> tuple[datetime, uuid.UUID] | None:
    if not cursor:
        return None
    try:
        dados = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
        return datetime.fromisoformat(dados["created_at"]), uuid.UUID(dados["id"])
    except Exception:  # noqa: BLE001 - cursor inválido é ignorado (primeira página)
        return None


def codificar(created_at: datetime, id_: uuid.UUID) -> str:
    bruto = json.dumps({"created_at": created_at.isoformat(), "id": str(id_)})
    return base64.urlsafe_b64encode(bruto.encode()).decode()


def aplicar_cursor(consulta, modelo, cursor: str | None):
    posicao = decodificar(cursor)
    if posicao:
        consulta = consulta.where(
            tuple_(modelo.created_at, modelo.id) > tuple_(posicao[0], posicao[1])
        )
    return consulta
