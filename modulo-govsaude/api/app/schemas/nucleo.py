"""Schemas de usuários, grupos e escopos."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.permissoes import GRUPOS_NACIONAIS


class UsuarioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str = Field(min_length=3, max_length=200)
    email: EmailStr
    nome_acesso: str | None = Field(default=None, max_length=80)
    cpf: str | None = None
    cns: str | None = None
    telefone: str | None = None
    senha: str | None = Field(default=None, min_length=8, max_length=128)
    grupo: str = Field(default="consulta_gestao")
    estabelecimento_id: uuid.UUID | None = None
    equipe_id: uuid.UUID | None = None
    especialidade_id: uuid.UUID | None = None

    def validar_grupo(self) -> None:
        if self.grupo not in GRUPOS_NACIONAIS:
            raise ValueError("Grupo inválido.")


class UsuarioUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str | None = Field(default=None, min_length=3, max_length=200)
    email: EmailStr | None = None
    ativo: bool | None = None
    grupo: str | None = None
    estabelecimento_id: uuid.UUID | None = None
    equipe_id: uuid.UUID | None = None
    especialidade_id: uuid.UUID | None = None
    motivo_baixa: str | None = Field(default=None, min_length=10, max_length=400)


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str
    email: str
    ativo: bool
    tenant_id: uuid.UUID
    ultimo_acesso_em: datetime | None = None
    mfa_ativo: bool = False
    created_at: datetime


class GrupoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    codigo: str
    nome: str
    sistema: bool
    requer_consentimento: bool


class VinculoGrupoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    grupo: GrupoOut
    estabelecimento_id: uuid.UUID | None = None
    equipe_id: uuid.UUID | None = None
    especialidade_id: uuid.UUID | None = None
    vigencia_inicio: date
    vigencia_fim: date | None = None
    ativo: bool


class VinculoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    grupo: str
    estabelecimento_id: uuid.UUID | None = None
    equipe_id: uuid.UUID | None = None
    especialidade_id: uuid.UUID | None = None
