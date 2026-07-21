import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class PessoaAbordadaCreate(BaseModel):
    nome: Optional[str] = None
    nome_social: Optional[str] = None
    idade_estimada: Optional[int] = None
    sexo: Optional[str] = None
    possui_documento: bool = False
    tempo_rua_estimado: Optional[str] = None
    aceitou_acolhimento: bool = False
    encaminhado_para: Optional[str] = None
    observacoes: Optional[str] = None


class PessoaAbordadaOut(BaseModel):
    id: uuid.UUID
    busca_ativa_id: uuid.UUID
    nome: Optional[str]
    nome_social: Optional[str]
    idade_estimada: Optional[int]
    sexo: Optional[str]
    possui_documento: bool
    tempo_rua_estimado: Optional[str]
    aceitou_acolhimento: bool
    encaminhado_para: Optional[str]
    observacoes: Optional[str]
    created_at: datetime


class BuscaAtivaCreate(BaseModel):
    professional_id: Optional[uuid.UUID] = None
    data_acao: date
    local_logradouro: Optional[str] = None
    local_bairro: Optional[str] = None
    local_referencia: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    equipe_nomes: Optional[list[str]] = None
    pessoas_abordadas: int = 0
    pessoas_aceitaram_acolhimento: int = 0
    pessoas_encaminhadas: int = 0
    observacoes: Optional[str] = None
    pessoas: Optional[list[PessoaAbordadaCreate]] = None


class BuscaAtivaUpdate(BaseModel):
    professional_id: Optional[uuid.UUID] = None
    data_acao: Optional[date] = None
    local_logradouro: Optional[str] = None
    local_bairro: Optional[str] = None
    local_referencia: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    equipe_nomes: Optional[list[str]] = None
    pessoas_abordadas: Optional[int] = None
    pessoas_aceitaram_acolhimento: Optional[int] = None
    pessoas_encaminhadas: Optional[int] = None
    observacoes: Optional[str] = None
    fotos_urls: Optional[list[str]] = None


class BuscaAtivaOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    professional_id: Optional[uuid.UUID]
    data_acao: date
    local_logradouro: Optional[str]
    local_bairro: Optional[str]
    local_referencia: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    equipe_nomes: Optional[list]
    pessoas_abordadas: int
    pessoas_aceitaram_acolhimento: int
    pessoas_encaminhadas: int
    observacoes: Optional[str]
    fotos_urls: Optional[list]
    pessoas: Optional[list[PessoaAbordadaOut]] = None
    created_at: datetime
    updated_at: datetime


class BuscaAtivaResumo(BaseModel):
    total_abordagens: int = 0
    total_aceitaram_acolhimento: int = 0
    total_encaminhados: int = 0
    total_pessoas_abordadas: int = 0
