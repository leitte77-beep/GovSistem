import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class ObraCreate(BaseModel):
    nome: str | None = Field(None, max_length=300)
    endereco: str | None = Field(None, max_length=500)
    coordenadas: str | None = None
    objeto: str | None = None
    empresa: str | None = Field(None, max_length=255)
    cnpj_empresa: str | None = Field(None, max_length=20)
    contrato_numero: str | None = Field(None, max_length=100)
    responsavel_tecnico: str | None = Field(None, max_length=255)
    fiscal_id: uuid.UUID | None = None
    gestor_id: uuid.UUID | None = None
    data_inicio: datetime | None = None
    previsao_conclusao: datetime | None = None
    valor_contrato: Decimal | None = None
    situacao: str | None = None
    observacoes: str | None = None


class ObraUpdate(BaseModel):
    nome: str | None = None
    endereco: str | None = None
    coordenadas: str | None = None
    objeto: str | None = None
    empresa: str | None = None
    cnpj_empresa: str | None = None
    contrato_numero: str | None = None
    responsavel_tecnico: str | None = None
    fiscal_id: uuid.UUID | None = None
    gestor_id: uuid.UUID | None = None
    data_inicio: datetime | None = None
    previsao_conclusao: datetime | None = None
    valor_contrato: Decimal | None = None
    situacao: str | None = None
    percentual_fisico: Decimal | None = None
    percentual_financeiro: Decimal | None = None
    observacoes: str | None = None


class CronogramaItemCreate(BaseModel):
    descricao: str = Field(..., min_length=3, max_length=300)
    valor: Decimal | None = None
    percentual_previsto: Decimal | None = None
    percentual_realizado: Decimal | None = None
    data_inicio_prevista: datetime | None = None
    data_fim_prevista: datetime | None = None
    ordem: int = 0


class CronogramaItemUpdate(BaseModel):
    percentual_realizado: Decimal | None = None
    valor: Decimal | None = None
    percentual_previsto: Decimal | None = None
    data_inicio_prevista: datetime | None = None
    data_fim_prevista: datetime | None = None


class CronogramaItemOut(BaseModel):
    id: uuid.UUID
    obra_id: uuid.UUID
    descricao: str
    valor: Decimal | None
    percentual_previsto: Decimal | None
    percentual_realizado: Decimal | None
    data_inicio_prevista: datetime | None
    data_fim_prevista: datetime | None
    ordem: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ObraOut(BaseModel):
    id: uuid.UUID
    convenio_id: uuid.UUID
    nome: str | None
    endereco: str | None
    coordenadas: str | None
    objeto: str | None
    empresa: str | None
    cnpj_empresa: str | None
    contrato_numero: str | None
    responsavel_tecnico: str | None
    fiscal_id: uuid.UUID | None
    gestor_id: uuid.UUID | None
    data_inicio: datetime | None
    previsao_conclusao: datetime | None
    valor_contrato: Decimal | None
    situacao: str | None
    percentual_fisico: Decimal | None
    percentual_financeiro: Decimal | None
    observacoes: str | None
    cronograma: list[CronogramaItemOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DiarioCreate(BaseModel):
    tipo: str = "VISITA"
    data: datetime | None = None
    titulo: str | None = Field(None, max_length=300)
    descricao: str | None = None


class DiarioOut(BaseModel):
    id: uuid.UUID
    obra_id: uuid.UUID
    tipo: str
    data: datetime | None
    titulo: str | None
    descricao: str | None
    registrado_por_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class FotoCreate(BaseModel):
    data: datetime | None = None
    observacao: str | None = None
    etapa: str | None = Field(None, max_length=100)
    medicao_id: uuid.UUID | None = None
    latitude: str | None = None
    longitude: str | None = None


class FotoOut(BaseModel):
    id: uuid.UUID
    obra_id: uuid.UUID
    data: datetime | None
    observacao: str | None
    etapa: str | None
    medicao_id: uuid.UUID | None
    latitude: str | None
    longitude: str | None
    anexo_id: uuid.UUID | None
    registrado_por_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}
