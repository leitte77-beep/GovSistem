"""Schemas de autenticação, sessão e termo de uso."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identificador: str = Field(
        min_length=3,
        max_length=200,
        description="CPF, e-mail ou nome de acesso.",
    )
    senha: str = Field(min_length=1, max_length=128)
    organizacao: str | None = Field(
        default=None,
        description=(
            "Slug, ID externo ou UUID do tenant; necessário se o identificador "
            "existir em mais de um."
        ),
    )
    codigo_mfa: str | None = Field(default=None, max_length=10)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int
    senha_expirada: bool = False
    termo_pendente: bool = False


class RefreshRequest(BaseModel):
    refresh_token: str


class GrupoResumo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    codigo: str
    nome: str
    estabelecimento_id: uuid.UUID | None = None
    equipe_id: uuid.UUID | None = None


class UsuarioMe(BaseModel):
    id: uuid.UUID
    nome: str
    email: str
    tenant_id: uuid.UUID
    organizacao_nome: str | None = None
    grupos: list[GrupoResumo] = []
    permissoes: list[str] = []
    menus: list[dict] = []
    mfa_ativo: bool = False
    senha_expirada: bool = False
    termo_pendente: bool = False
    termo_versao: str | None = None


class AlterarSenhaRequest(BaseModel):
    senha_atual: str
    nova_senha: str = Field(min_length=8, max_length=128)


class MfaCodigoRequest(BaseModel):
    codigo: str = Field(min_length=6, max_length=10)


class MfaAtivacaoResponse(BaseModel):
    segredo: str
    uri: str
    mensagem: str


class TermoResumo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    versao: str
    titulo: str
    conteudo_md: str
    obrigatorio: bool
    vigencia_inicio: datetime


class TermoAceiteRequest(BaseModel):
    termo_id: uuid.UUID
    aceito: bool = True


class TermoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    versao: str
    titulo: str
    conteudo_md: str
    obrigatorio: bool = True
