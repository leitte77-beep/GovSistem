"""Schemas da trilha de auditoria."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class AuditoriaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    tenant_id: uuid.UUID | None = None
    usuario_id: uuid.UUID | None = None
    usuario_nome: str | None = None
    grupo_ativo: str | None = None
    acao: str
    recurso: str | None = None
    recurso_id: uuid.UUID | None = None
    resultado: str
    finalidade: str | None = None
    justificativa: str | None = None
    ip: str | None = None
    request_id: str | None = None
    diff: dict | None = None


class AuditoriaFiltro(BaseModel):
    acao: str | None = None
    recurso: str | None = None
    usuario_id: uuid.UUID | None = None
    data_inicio: date | None = None
    data_fim: date | None = None
    cursor: str | None = None
    limite: int = 50
