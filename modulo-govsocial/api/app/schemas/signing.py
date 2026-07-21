"""Schemas para assinatura digital de documentos."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AssinaturaSolicitarIn(BaseModel):
    documento_tipo: str = Field(..., max_length=50, description="DECLARACAO | COMPROVANTE | ATESTADO | TERMO | OFICIO | RELATORIO")
    documento_id: Optional[uuid.UUID] = None
    titulo: str = Field(..., max_length=255)
    dados_documento: dict = Field(..., description="Conteúdo do documento a ser assinado")
    signatario_id: Optional[uuid.UUID] = None
    signatario_nome: Optional[str] = Field(None, max_length=200)
    signatario_cpf: Optional[str] = Field(None, max_length=14)
    motivo: Optional[str] = Field(None, max_length=500)
    validade_dias: int = Field(default=365, ge=1, le=3650)


class AssinaturaAssinarIn(BaseModel):
    assinatura_base64: str = Field(..., description="Assinatura digital em base64 (canvas / token / certificado)")
    hash_documento: Optional[str] = Field(None, max_length=64, description="Hash SHA-256 do documento (opcional, recalculado se omitido)")


class AssinaturaOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    documento_tipo: str
    documento_id: Optional[uuid.UUID]
    titulo: str
    hash_documento: Optional[str]
    dados_documento: Optional[dict]
    status: str
    signatario_id: Optional[uuid.UUID]
    signatario_nome: Optional[str]
    signatario_cpf: Optional[str]
    data_assinatura: Optional[datetime]
    ip_assinatura: Optional[str]
    certificado_url: Optional[str]
    validade_dias: int
    metadata_json: Optional[dict]
    verificacao_status: Optional[str]
    verificacao_data: Optional[datetime]
    solicitado_por_id: Optional[uuid.UUID]
    motivo: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AssinaturaVerificacaoOut(BaseModel):
    id: uuid.UUID
    status: str
    verificacao_status: str
    hash_documento: Optional[str]
    hash_atual: Optional[str]
    integro: bool
    data_assinatura: Optional[datetime]
    validade_dias: int
    expira_em: Optional[datetime]
    expirado: bool
    signatario_nome: Optional[str]
    assinatura_presente: bool
    detalhes: dict


class AssinaturaCertificadoOut(BaseModel):
    id: uuid.UUID
    titulo: str
    documento_tipo: str
    hash_documento: Optional[str]
    data_assinatura: Optional[datetime]
    signatario_nome: Optional[str]
    signatario_cpf: Optional[str]
    ip_assinatura: Optional[str]
    validade_dias: int
    validade_ate: Optional[datetime]
    status: str
    certificado_url: Optional[str]
    metadata_json: Optional[dict]
