"""Schemas da central de documentos (§29–§32)."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    CategoriaDocumento,
    ClassificacaoDocumento,
    TipoDocumento,
)
from app.schemas.demanda import PessoaOut


class DocumentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome_arquivo: str
    descricao: Optional[str] = None
    pasta: Optional[str] = None
    tipo_documento: TipoDocumento
    categoria: CategoriaDocumento
    classificacao: ClassificacaoDocumento
    tamanho_bytes: int
    mime_type: Optional[str] = None
    hash_sha256: Optional[str] = None
    documento_grupo_id: Optional[uuid.UUID] = None
    versao: int
    versao_atual: bool
    motivo_versao: Optional[str] = None
    enviado_por: Optional[PessoaOut] = None
    tarefa_id: Optional[uuid.UUID] = None
    etapa_id: Optional[uuid.UUID] = None
    protocolo_id: Optional[uuid.UUID] = None
    created_at: datetime


class PastaOut(BaseModel):
    """Um nó da árvore documental (§30)."""

    pasta: str
    quantidade: int
    documentos: list[DocumentoOut]


class ArvoreOut(BaseModel):
    pastas: list[PastaOut]
    total: int
    pastas_sugeridas: list[str]


class RemoverDocumentoRequest(BaseModel):
    motivo: str = Field(
        min_length=5,
        description="Exclusão é lógica e sempre justificada; o histórico permanece",
    )


class DocumentoAtualizar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    descricao: Optional[str] = None
    pasta: Optional[str] = Field(default=None, max_length=120)
    tipo_documento: Optional[TipoDocumento] = None
    categoria: Optional[CategoriaDocumento] = None
    classificacao: Optional[ClassificacaoDocumento] = None
