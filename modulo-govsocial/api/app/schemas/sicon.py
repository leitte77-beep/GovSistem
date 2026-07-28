import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class SiconDataOut(BaseModel):
    id: uuid.UUID
    family_id: Optional[uuid.UUID]
    nis_responsavel: str
    data_referencia: date
    descumprimento_educacao: bool
    descumprimento_saude: bool
    efeito_beneficio: Optional[str]
    data_efeito: Optional[date]
    membros_afetados: Optional[str]
    observacoes: Optional[str]
    created_at: datetime


class SiconFamilySummary(BaseModel):
    """Resumo das condicionalidades ativas para uma familia."""
    family_id: uuid.UUID
    nis_responsavel: str
    possui_descumprimento: bool
    descumprimento_educacao: bool
    descumprimento_saude: bool
    efeito_atual: Optional[str]
    data_ultima_atualizacao: date
    registros: list[SiconDataOut]


class SiconImportJobOut(BaseModel):
    id: uuid.UUID
    tipo: str
    status: str
    nome_arquivo: str
    total_linhas: Optional[int]
    linhas_processadas: Optional[int]
    novos: Optional[int]
    atualizados: Optional[int]
    conflitos: Optional[int]
    erros: Optional[int]
    data_referencia: Optional[date] = Field(None, description="Mes/ano de referencia detectado no arquivo")
    created_at: datetime
    updated_at: datetime
