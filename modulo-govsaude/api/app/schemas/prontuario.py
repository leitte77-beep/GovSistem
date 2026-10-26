from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AtendimentoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cidadao_id: uuid.UUID
    estabelecimento_id: uuid.UUID | None = None
    iniciado_em: datetime
    sigiloso: bool = False
    tipo: str = Field(default="CONSULTA", min_length=2, max_length=40)
    dados_triagem: dict | None = None
    classificacao_risco: str | None = Field(default=None, max_length=40)
    retroativo: bool = False
    justificativa_retroativa: str | None = Field(default=None, max_length=2000)


class AtendimentoOut(AtendimentoCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    profissional_id: uuid.UUID | None
    status: str
    finalizado_em: datetime | None
    versao: int


class AtendimentoEncerrar(BaseModel):
    model_config = ConfigDict(extra="forbid")
    finalizado_em: datetime | None = None


class SOAPCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subjetivo: str | None = None
    objetivo: str | None = None
    avaliacao: str | None = None
    plano: str | None = None


class SOAPOut(SOAPCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    atendimento_id: uuid.UUID
    assinado_em: datetime | None
    retifica_de_id: uuid.UUID | None
    versao: int


class SinalVitalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dados: dict = Field(min_length=1)


class ProblemaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codigo: str
    sistema: str
    descricao: str | None = None


class PlanoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    objetivo: str
    acoes: dict


class PrescricaoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    itens: dict = Field(min_length=1)


class RetificacaoSOAPCreate(SOAPCreate):
    """Uma retificação nunca substitui a evolução assinada."""

    justificativa: str = Field(min_length=20, max_length=2000)


class RegistroAssistencialCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cidadao_id: uuid.UUID
    atendimento_id: uuid.UUID | None = None
    tipo: str = Field(min_length=2, max_length=50)
    dados: dict = Field(min_length=1)


class RegistroAssistencialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    cidadao_id: uuid.UUID
    atendimento_id: uuid.UUID | None
    tipo: str
    status: str
    dados: dict
    assinado_em: datetime | None
    retifica_de_id: uuid.UUID | None
    versao: int
