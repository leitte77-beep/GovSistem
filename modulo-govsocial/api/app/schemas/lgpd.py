"""Schemas para LGPD, retenção e segurança."""
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class DataExtractOut(BaseModel):
    dados_cadastrais: dict
    familias: list[dict]
    atendimentos: list[dict]
    beneficios: list[dict]
    encaminhamentos: list[dict]
    gerado_em: str


class DataCorrectionRequest(BaseModel):
    nome_civil: Optional[str] = None
    nome_social: Optional[str] = None
    data_nascimento: Optional[str] = None
    escolaridade: Optional[str] = None


class DataDeletionResponse(BaseModel):
    message: str


class RetentionPolicyCreate(BaseModel):
    categoria: str = Field(..., max_length=50)
    retencao_dias: int = Field(..., ge=30, le=3650)
    acao: str = "ANONIMIZAR"
    base_legal: str = "LGPD art. 16, I — cumprimento de obrigação legal"


class RetentionPolicyOut(BaseModel):
    id: uuid.UUID
    categoria: str
    retencao_dias: int
    acao: str
    base_legal: str
    ativo: bool
    created_at: datetime
