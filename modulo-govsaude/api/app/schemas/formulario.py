"""Contratos de formulários dinâmicos versionados (B.2-004, B.12-013)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class FormularioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    codigo: str = Field(
        min_length=2,
        max_length=80,
        pattern=r"^[A-Z0-9][A-Z0-9_.-]*$",
        description="Código estável do formulário.",
    )
    nome: str = Field(min_length=2, max_length=200)
    versao: int = Field(default=1, ge=1)
    schema_definicao: dict[str, Any] = Field(
        validation_alias=AliasChoices("schema_definicao", "schema_json"),
        serialization_alias="schema_json",
        description="JSON Schema (subconjunto suportado pelo motor).",
    )
    vigencia_inicio: date = Field(default_factory=date.today)
    vigencia_fim: date | None = None
    ativo: bool = True


class FormularioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    codigo: str
    nome: str
    versao: int
    schema_definicao: dict[str, Any] = Field(
        validation_alias=AliasChoices("schema_definicao", "schema_json"),
        serialization_alias="schema_json",
    )
    vigencia_inicio: date
    vigencia_fim: date | None = None
    ativo: bool


class RespostaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entidade: str = Field(min_length=2, max_length=60)
    entidade_id: uuid.UUID
    resposta: dict[str, Any]


class RespostaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    formulario_id: uuid.UUID
    entidade: str
    entidade_id: uuid.UUID
    resposta: dict[str, Any]
    versao_formulario: int
    created_at: datetime
