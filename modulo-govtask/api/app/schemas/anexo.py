import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import CategoriaDocumento, ClassificacaoDocumento, TipoDocumento


class AnexoOut(BaseModel):
    id: uuid.UUID
    convenio_id: uuid.UUID
    etapa_id: uuid.UUID | None
    tarefa_id: uuid.UUID | None
    medicao_id: uuid.UUID | None
    prestacao_id: uuid.UUID | None
    diligencia_id: uuid.UUID | None
    entrega_id: uuid.UUID | None
    nome_arquivo: str
    tipo_documento: TipoDocumento
    categoria: CategoriaDocumento
    classificacao: ClassificacaoDocumento
    descricao: str | None
    storage_path: str
    tamanho_bytes: int
    versao: int
    enviado_por_id: uuid.UUID
    motivo_versao: str | None
    enviado_externo: bool
    enviado_externo_data: datetime | None
    enviado_externo_sistema: str | None
    enviado_externo_protocolo: str | None
    enviado_externo_observacao: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MarcarEnviadoExterno(BaseModel):
    sistema: str | None = Field(None, max_length=100)
    protocolo: str | None = Field(None, max_length=100)
    data: datetime | None = None
    observacao: str | None = None
