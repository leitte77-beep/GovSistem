"""Contratos do PEC ambulatorial (Fase 5, B.6-004…058)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

TipoReceituario = Literal["COMUM", "ANTIMICROBIANO", "CONTROLADO"]


class AtendimentoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cidadao_id: uuid.UUID
    estabelecimento_id: uuid.UUID | None = None
    iniciado_em: datetime
    sigiloso: bool = False
    nivel_sigilo: Literal["NORMAL", "RESTRITO_ESPECIALIDADE", "SIGILOSO"] | None = Field(
        default=None, description="B.6-035; `sigiloso=true` sem nível equivale a SIGILOSO."
    )
    especialidade_id: uuid.UUID | None = None
    fila_id: uuid.UUID | None = Field(
        default=None, description="Fila da recepção/triagem que originou o atendimento."
    )
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
    etapa: str | None
    finalizado_em: datetime | None
    versao: int
    nivel_sigilo: str = "NORMAL"
    alertas_alergia: list[dict] = []


class AtendimentoEncerrar(BaseModel):
    model_config = ConfigDict(extra="forbid")
    finalizado_em: datetime | None = None


class EtapaAvancar(BaseModel):
    model_config = ConfigDict(extra="forbid")
    etapa: str = Field(min_length=2, max_length=40)


class SOAPCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subjetivo: str | None = Field(default=None, max_length=20000)
    objetivo: str | None = Field(default=None, max_length=20000)
    avaliacao: str | None = Field(default=None, max_length=20000)
    plano: str | None = Field(default=None, max_length=20000)


class SOAPOut(SOAPCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    atendimento_id: uuid.UUID
    assinado_em: datetime | None
    retifica_de_id: uuid.UUID | None
    versao: int


class RetificacaoSOAPCreate(SOAPCreate):
    """Uma retificação nunca substitui a evolução assinada."""

    justificativa: str = Field(min_length=20, max_length=2000)


class SinalVitalCreate(BaseModel):
    """B.6-010/011 — peso em kg e altura em cm são opcionais; o IMC sai deles."""

    model_config = ConfigDict(extra="forbid")
    dados: dict = Field(min_length=1)
    peso_kg: float | None = Field(default=None, gt=0, le=700)
    altura_cm: float | None = Field(default=None, gt=20, le=280)


class SinalVitalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    atendimento_id: uuid.UUID
    cidadao_id: uuid.UUID
    dados: dict
    created_at: datetime


class PlanoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    objetivo: str = Field(min_length=2, max_length=4000)
    acoes: dict
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None

    @model_validator(mode="after")
    def _vigencia(self):
        if self.vigencia_inicio and self.vigencia_fim and self.vigencia_fim < self.vigencia_inicio:
            raise ValueError("vigencia_fim anterior a vigencia_inicio")
        return self


class PlanoOut(PlanoCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    atendimento_id: uuid.UUID
    status: str
    versao: int


class PrescricaoItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    medicamento_codigo: str | None = Field(default=None, max_length=30)
    descricao: str = Field(min_length=2, max_length=300)
    via: str | None = Field(default=None, max_length=60)
    posologia: str = Field(min_length=2, max_length=1000)
    quantidade: str | None = Field(default=None, max_length=100)
    uso_continuo: bool = False
    tipo_receituario: TipoReceituario = "COMUM"


class PrescricaoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    itens: list[PrescricaoItem] = Field(min_length=1, max_length=50)


class PrescricaoCopiar(BaseModel):
    """B.6-019 — cópia assistida: o profissional confirma quais itens repetir."""

    model_config = ConfigDict(extra="forbid")
    prescricao_origem_id: uuid.UUID
    indices_itens: list[int] | None = None


class PrescricaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    atendimento_id: uuid.UUID
    cidadao_id: uuid.UUID
    itens: list[dict]
    alertas: dict | None
    receituarios: list[dict] = []
    copiada_de_id: uuid.UUID | None
    assinada_em: datetime | None
    versao: int


class RegistroAssistencialCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cidadao_id: uuid.UUID
    atendimento_id: uuid.UUID | None = None
    tipo: str = Field(min_length=2, max_length=50)
    dados: dict = Field(min_length=1)
    sigiloso: bool = False


class RetificacaoRegistroCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dados: dict = Field(min_length=1)
    justificativa: str = Field(min_length=20, max_length=2000)


class RegistroAssistencialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    cidadao_id: uuid.UUID
    atendimento_id: uuid.UUID | None
    tipo: str
    status: str
    dados: dict
    sigiloso: bool
    nivel_sigilo: str = "NORMAL"
    versao_formulario: int | None
    assinado_em: datetime | None
    retifica_de_id: uuid.UUID | None
    versao: int


class ValidadeConsultaOut(BaseModel):
    cidadao_id: uuid.UUID
    tipo: str
    situacao: Literal["NAO_CONFIGURADO", "SEM_ATENDIMENTO", "VIGENTE", "VENCIDA"]
    ultimo_atendimento_em: datetime | None = None
    valida_ate: date | None = None
    dias_validade: int | None = None
