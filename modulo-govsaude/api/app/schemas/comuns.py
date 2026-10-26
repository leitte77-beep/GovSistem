"""Schemas comuns: paginação por cursor, jobs e respostas de erro."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class Pagina(BaseModel, Generic[T]):
    itens: list[T]
    proximo_cursor: str | None = None
    total_estimado: int | None = None


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tipo: str
    status: str
    progresso: int
    erro: str | None = None
    resultado_chave: str | None = None
    iniciado_em: datetime | None = None
    concluido_em: datetime | None = None
    created_at: datetime


class ConfiguracaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    chave: str
    valor: dict
    tipo: str
    descricao: str | None = None
    editavel: bool
    versao: int
    vigencia_inicio: Any
    vigencia_fim: Any | None = None


class ConfiguracaoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    valor: dict = Field(description="Objeto no formato {'valor': ...}.")


class ReferenciaOut(BaseModel):
    codigo: str
    descricao: str


class MensagemOut(BaseModel):
    mensagem: str
    request_id: str | None = None
