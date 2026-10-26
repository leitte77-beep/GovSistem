"""Payloads de sincronização enviados pela saas-platform."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SyncOrganizacaoRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    organization_id: str
    name: str = ""
    slug: str | None = None
    cnpj: str | None = None
    description: str | None = None
    logo_url: str | None = None
    public_url: str | None = None
    is_active: bool = True
    uf: str | None = None
    municipio_ibge: str | None = None
    tipo: str = "MUNICIPIO"
    fuso_horario: str = "America/Sao_Paulo"


class SyncUsuarioRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    user_id: str
    organization_id: str
    name: str = ""
    email: EmailStr | str = ""
    is_active: bool = True
    roles: list[str] = Field(default_factory=list)


class SyncResposta(BaseModel):
    organization_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    status: str = "sincronizado"
