"""Contratos da Fase 9 — imunização (B.7-001…013, B.7-024…029)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class VacinaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codigo: str = Field(min_length=1, max_length=30)
    nome: str = Field(min_length=2, max_length=240)
    produto_id: uuid.UUID | None = None
    codigo_referencia: str | None = Field(default=None, max_length=20)
    fabricante: str | None = Field(default=None, max_length=200)
    apresentacao: str | None = Field(default=None, max_length=120)
    via: str | None = Field(default=None, max_length=40)
    doses_por_frasco: int = Field(default=1, ge=1, le=100)
    validade_pos_abertura_horas: int | None = Field(default=None, ge=1, le=24 * 60)

    @model_validator(mode="after")
    def _multidose(self):
        if self.doses_por_frasco > 1 and self.validade_pos_abertura_horas is None:
            raise ValueError(
                "Frasco multidose exige validade_pos_abertura_horas (dado do fabricante/norma)."
            )
        return self


class VacinaOut(VacinaCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    versao: int


class DoseEsquema(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dose: str = Field(min_length=1, max_length=20)
    ordem: int = Field(ge=1, le=50)
    idade_min_dias: int | None = Field(default=None, ge=0)
    idade_max_dias: int | None = Field(default=None, ge=0)
    intervalo_min_dias: int | None = Field(default=None, ge=0)
    intervalo_recomendado_dias: int | None = Field(default=None, ge=0)
    sexo: Literal["FEMININO", "MASCULINO"] | None = None


class EsquemaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    vacina_id: uuid.UUID
    codigo: str = Field(min_length=2, max_length=40)
    nome: str = Field(min_length=2, max_length=200)
    vigencia_inicio: date
    vigencia_fim: date | None = None
    fonte_normativa: str | None = Field(default=None, max_length=2000)
    acao_violacao: Literal["ALERTAR", "BLOQUEAR"] = "ALERTAR"
    doses: list[DoseEsquema] = Field(min_length=1, max_length=50)
    ativo: bool = False

    @model_validator(mode="after")
    def _consistencia(self):
        ordens = [d.ordem for d in self.doses]
        if len(set(ordens)) != len(ordens) or len({d.dose for d in self.doses}) != len(self.doses):
            raise ValueError("Doses e ordens devem ser únicas no esquema.")
        if self.vigencia_fim and self.vigencia_fim < self.vigencia_inicio:
            raise ValueError("vigencia_fim anterior a vigencia_inicio")
        return self


class EsquemaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    vacina_id: uuid.UUID
    codigo: str
    nome: str
    numero_versao: int
    vigencia_inicio: date
    vigencia_fim: date | None
    ativo: bool
    origem: str
    fonte_normativa: str | None
    acao_violacao: str
    doses: list[dict]
    versao: int


class AtivacaoEsquema(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ativo: bool
    fonte_normativa: str | None = Field(default=None, max_length=2000)


class FrascoAbrir(BaseModel):
    model_config = ConfigDict(extra="forbid")
    vacina_id: uuid.UUID
    local_id: uuid.UUID
    lote_id: uuid.UUID
    aberto_em: datetime | None = None


class FrascoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    vacina_id: uuid.UUID
    local_id: uuid.UUID
    lote_id: uuid.UUID
    aberto_em: datetime
    usar_ate: datetime | None
    doses_total: int
    doses_aplicadas: int
    doses_perdidas: int
    situacao: str
    descartado_em: datetime | None
    descarte_motivo: str | None
    descarte_automatico: bool


class Motivo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    motivo: str = Field(min_length=5, max_length=2000)


class AplicacaoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cidadao_id: uuid.UUID
    vacina_id: uuid.UUID
    dose: str = Field(min_length=1, max_length=20)
    estrategia: str | None = Field(default=None, max_length=60)
    aplicada_em: datetime | None = None
    origem: Literal["LOCAL", "EXTERNA"] = "LOCAL"
    estabelecimento_id: uuid.UUID | None = None
    local_id: uuid.UUID | None = None
    lote_id: uuid.UUID | None = None
    frasco_id: uuid.UUID | None = None
    lote_externo: str | None = Field(default=None, max_length=60)
    local_externo: str | None = Field(default=None, max_length=240)
    agendamento_id: uuid.UUID | None = None
    excecao_justificativa: str | None = Field(default=None, max_length=2000)


class AplicacaoRetificar(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dose: str | None = Field(default=None, min_length=1, max_length=20)
    estrategia: str | None = Field(default=None, max_length=60)
    aplicada_em: datetime | None = None
    justificativa: str = Field(min_length=20, max_length=2000)


class AplicacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    cidadao_id: uuid.UUID
    vacina_id: uuid.UUID
    esquema_id: uuid.UUID | None
    dose: str
    estrategia: str | None
    aplicada_em: datetime
    origem: str
    estabelecimento_id: uuid.UUID | None
    local_id: uuid.UUID | None
    lote_id: uuid.UUID | None
    frasco_id: uuid.UUID | None
    lote_externo: str | None
    local_externo: str | None
    alertas: list[dict] | None
    excecao_justificativa: str | None
    situacao: str
    retifica_de_id: uuid.UUID | None
    motivo_alteracao: str | None
    versao: int


class AgendamentoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cidadao_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    vacina_id: uuid.UUID
    dose: str = Field(min_length=1, max_length=20)
    data_prevista: date
    observacao: str | None = Field(default=None, max_length=2000)


class Reagendar(BaseModel):
    model_config = ConfigDict(extra="forbid")
    data_prevista: date
    motivo: str = Field(min_length=5, max_length=2000)


class AgendamentoOut(AgendamentoCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    situacao: str
    aplicacao_id: uuid.UUID | None
    reagendado_para_id: uuid.UUID | None
    motivo: str | None
    versao: int
