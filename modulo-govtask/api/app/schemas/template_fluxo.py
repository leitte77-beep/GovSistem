import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import NaturezaEtapa, TipoConvenio


class TemplateEtapaCreate(BaseModel):
    nome: str = Field(..., max_length=255)
    ordem: int
    natureza: NaturezaEtapa = NaturezaEtapa.INTERNA


class TemplateFluxoCreate(BaseModel):
    nome: str = Field(..., max_length=255)
    tipo_convenio: TipoConvenio
    descricao: str | None = None
    etapas: list[TemplateEtapaCreate] = []


class TemplateEtapaOut(BaseModel):
    id: uuid.UUID
    nome: str
    ordem: int
    natureza: NaturezaEtapa

    model_config = {"from_attributes": True}


class TemplateFluxoOut(BaseModel):
    id: uuid.UUID
    nome: str
    tipo_convenio: TipoConvenio
    descricao: str | None
    etapas: list[TemplateEtapaOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}
