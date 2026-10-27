"""Contratos da Fase 11 — central de integrações."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ParametrosIntegracao(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url_base: str | None = Field(default=None, max_length=300)
    transmissao_automatica: bool | None = None
    periodicidade_minutos: int | None = Field(default=None, ge=15, le=7 * 24 * 60)
    competencias_abertas: int | None = Field(default=None, ge=1, le=6)
    homologacao_aprovada_em: date | None = None

    @field_validator("url_base")
    @classmethod
    def _https(cls, v):
        if v and not v.startswith("https://"):
            raise ValueError("url_base deve usar HTTPS.")
        return v


class ConfiguracaoIntegracao(BaseModel):
    model_config = ConfigDict(extra="forbid")
    versao_layout: str | None = Field(default=None, max_length=40)
    ambiente: Literal["HOMOLOGACAO", "PRODUCAO"] = "HOMOLOGACAO"
    ativo: bool = True
    credenciais_ref: str | None = Field(
        default=None, max_length=200, pattern=r"^(env:[A-Z0-9_]+|arquivo:/[\w./-]+)$"
    )
    parametros: ParametrosIntegracao | None = None


class MensagemRetorno(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codigo: str | None = Field(default=None, max_length=60)
    campo: str | None = Field(default=None, max_length=120)
    texto: str = Field(min_length=1, max_length=2000)


class ItemRetorno(BaseModel):
    model_config = ConfigDict(extra="forbid")
    envio_id: uuid.UUID | None = None
    protocolo: str | None = Field(default=None, max_length=120)
    lote_id: str | None = Field(default=None, max_length=120)
    registro_id: uuid.UUID | None = None
    situacao: Literal["ACEITO", "REJEITADO"]
    mensagens: list[MensagemRetorno] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def _chave(self):
        if not (self.envio_id or self.protocolo or (self.lote_id and self.registro_id)):
            raise ValueError("Informe envio_id, protocolo ou lote_id + registro_id.")
        return self


class Retornos(BaseModel):
    model_config = ConfigDict(extra="forbid")
    itens: list[ItemRetorno] = Field(min_length=1, max_length=5000)


class Motivo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    motivo: str = Field(min_length=5, max_length=2000)
