"""Contratos da Fase 3: território, domicílio e composição familiar."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TerritorioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nome: str = Field(min_length=1, max_length=120)
    codigo: str | None = Field(default=None, max_length=60)
    tipo: Literal["AREA", "MICROAREA"]
    territorio_pai_id: uuid.UUID | None = None
    equipe_id: uuid.UUID | None = None
    geometria: dict[str, Any] | None = None


class TerritorioOut(TerritorioCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    versao: int
    baixa_em: datetime | None = None


class DomicilioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    territorio_id: uuid.UUID | None = None
    cep: str | None = Field(default=None, max_length=8)
    logradouro: str = Field(min_length=1, max_length=240)
    numero: str | None = Field(default=None, max_length=30)
    complemento: str | None = Field(default=None, max_length=120)
    bairro: str | None = Field(default=None, max_length=120)
    distrito: str | None = Field(default=None, max_length=120)
    municipio_ibge: str | None = Field(default=None, max_length=7)
    uf: str | None = Field(default=None, min_length=2, max_length=2)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    tipo_imovel: str | None = Field(default=None, max_length=50)


class DomicilioOut(DomicilioCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    situacao: str
    versao: int
    baixa_em: datetime | None = None


class FamiliaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codigo: str | None = Field(default=None, max_length=60)
    responsavel_id: uuid.UUID | None = None
    risco: str | None = Field(default=None, max_length=40)
    risco_justificativa: str | None = Field(default=None, max_length=4000)
    domicilio_id: uuid.UUID | None = None


class FamiliaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    codigo: str | None
    responsavel_id: uuid.UUID | None
    risco: str | None
    risco_justificativa: str | None
    versao: int
    baixa_em: datetime | None = None


class FamiliaMembroCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cidadao_id: uuid.UUID
    parentesco: str | None = Field(default=None, max_length=60)
    responsavel: bool = False
    vigencia_inicio: date = Field(default_factory=date.today)


class FamiliaMembroOut(FamiliaMembroCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    familia_id: uuid.UUID
    vigencia_fim: date | None = None


class VinculoFim(BaseModel):
    model_config = ConfigDict(extra="forbid")
    vigencia_fim: date = Field(default_factory=date.today)

    @model_validator(mode="after")
    def data_valida(self):
        if self.vigencia_fim > date.today():
            raise ValueError("A data final não pode estar no futuro.")
        return self


class VisitaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    domicilio_id: uuid.UUID
    cidadao_id: uuid.UUID | None = None
    familia_id: uuid.UUID | None = None
    realizada_em: datetime
    turno: Literal["MANHA", "TARDE", "NOITE"] = "MANHA"
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    precisao_metros: float | None = Field(default=None, ge=0)
    justificativa_gps: str | None = Field(default=None, max_length=2000)
    resultado: str | None = Field(default=None, max_length=80)
    observacoes: str | None = Field(default=None, max_length=4000)
    assinatura_nome: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def gps_completo(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude e longitude devem ser informadas juntas.")
        return self


class VisitaOut(VisitaCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    profissional_id: uuid.UUID | None
    competencia: date
    assinatura_em: datetime | None
    versao: int


class CoberturaOut(BaseModel):
    competencia: date
    domicilios_ativos: int
    domicilios_visitados: int
    cobertura_percentual: float
    visitas_realizadas: int


class MetaTerritorialOut(BaseModel):
    competencia: date
    profissional_id: uuid.UUID | None
    meta_visitas: int
    visitas_realizadas: int
    atingimento_percentual: float


class AnimalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    especie: str = Field(min_length=1, max_length=80)
    quantidade: int = Field(default=1, ge=1, le=999)
    atributos: dict[str, Any] | None = None


class AnimalOut(AnimalCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    domicilio_id: uuid.UUID
