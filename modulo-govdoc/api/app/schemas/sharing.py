"""Schemas de compartilhamento interno, links externos e recebimento externo."""

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.common import Email

from app.models.enums import Permission, ResourceType, SubjectType


class InternalShareCreate(BaseModel):
    recurso_tipo: ResourceType
    recurso_id: uuid.UUID
    destino_tipo: SubjectType
    destino_id: uuid.UUID
    permissoes: List[Permission] = [Permission.VIEW, Permission.VIEW_METADATA]
    inicio: Optional[datetime] = None
    fim: Optional[datetime] = None
    motivo: Optional[str] = None
    notificar: bool = True
    exigir_confirmacao_leitura: bool = False


class InternalShareOut(BaseModel):
    id: uuid.UUID
    recurso_tipo: str
    recurso_id: uuid.UUID
    recurso_nome: Optional[str] = None
    destino_tipo: str
    destino_id: uuid.UUID
    destino_nome: Optional[str] = None
    permissoes: List[str]
    inicio: Optional[datetime] = None
    fim: Optional[datetime] = None
    motivo: Optional[str] = None
    compartilhado_por_id: Optional[uuid.UUID] = None
    compartilhado_por_nome: Optional[str] = None
    confirmado_em: Optional[datetime] = None
    revogado_em: Optional[datetime] = None
    criado_em: datetime
    local_original: Optional[str] = None
    atualizado_em: Optional[datetime] = None


class ExternalLinkCreate(BaseModel):
    nome: str = Field(min_length=2, max_length=200)
    descricao: Optional[str] = None
    itens: List[dict] = Field(
        description='Lista de {"tipo": "document|folder", "id": "uuid"}', min_length=1
    )
    expira_em: Optional[datetime] = None
    permitir_visualizacao: bool = True
    permitir_download: bool = True
    permitir_upload: bool = False
    max_acessos: Optional[int] = Field(default=None, ge=1)
    max_downloads: Optional[int] = Field(default=None, ge=1)
    senha: Optional[str] = Field(default=None, min_length=4, max_length=200)
    exigir_nome: bool = False
    exigir_email: bool = False
    exigir_telefone: bool = False
    exigir_codigo_email: bool = False
    ips_permitidos: Optional[List[str]] = None
    marca_dagua: bool = False
    termo_responsabilidade: Optional[str] = None
    notificar_acesso: bool = False
    notificar_download: bool = False


class ExternalLinkOut(BaseModel):
    id: uuid.UUID
    nome: str
    descricao: Optional[str] = None
    url: Optional[str] = None
    prefixo_token: str
    expira_em: Optional[datetime] = None
    permitir_visualizacao: bool
    permitir_download: bool
    permitir_upload: bool
    max_acessos: Optional[int] = None
    max_downloads: Optional[int] = None
    total_acessos: int
    total_downloads: int
    exige_senha: bool
    exigir_nome: bool
    exigir_email: bool
    marca_dagua: bool
    ativo: bool
    revogado_em: Optional[datetime] = None
    criado_por_id: Optional[uuid.UUID] = None
    criado_por_nome: Optional[str] = None
    criado_em: datetime
    itens: List[dict] = []


class ExternalLinkCreated(BaseModel):
    link: ExternalLinkOut
    url: str
    aviso: Optional[str] = None


class ExternalAccessIn(BaseModel):
    senha: Optional[str] = None
    nome: Optional[str] = None
    email: Optional[Email] = None
    telefone: Optional[str] = None
    codigo: Optional[str] = None


class ExternalUploadRequestCreate(BaseModel):
    titulo: str = Field(min_length=2, max_length=200)
    descricao: Optional[str] = None
    secretaria_id: Optional[uuid.UUID] = None
    setor_id: Optional[uuid.UUID] = None
    pasta_destino_id: uuid.UUID
    extensoes_aceitas: Optional[List[str]] = None
    tamanho_maximo_mb: int = Field(default=100, ge=1, le=2000)
    quantidade_maxima: int = Field(default=20, ge=1, le=200)
    prazo: Optional[datetime] = None
    exigir_identificacao: bool = True
    exigir_email: bool = True
    senha: Optional[str] = Field(default=None, min_length=4, max_length=200)
    exigir_codigo_email: bool = False
    termo_responsabilidade: Optional[str] = None
    observacoes: Optional[str] = None


class ExternalUploadRequestOut(BaseModel):
    id: uuid.UUID
    titulo: str
    descricao: Optional[str] = None
    url: Optional[str] = None
    prefixo_token: str
    responsavel_id: uuid.UUID
    responsavel_nome: Optional[str] = None
    pasta_destino_id: uuid.UUID
    pasta_destino_nome: Optional[str] = None
    extensoes_aceitas: Optional[List[str]] = None
    tamanho_maximo_mb: int
    quantidade_maxima: int
    prazo: Optional[datetime] = None
    exige_senha: bool
    ativo: bool
    total_recebidos: int = 0
    pendentes: int = 0
    criado_em: datetime


class ExternalUploadOut(BaseModel):
    id: uuid.UUID
    solicitacao_id: uuid.UUID
    solicitacao_titulo: Optional[str] = None
    nome_original: str
    mime: Optional[str] = None
    extensao: Optional[str] = None
    tamanho_bytes: int
    sha256: str
    remetente_nome: Optional[str] = None
    remetente_email: Optional[str] = None
    remetente_telefone: Optional[str] = None
    observacao_remetente: Optional[str] = None
    situacao_arquivo: str
    resultado_verificacao: Optional[str] = None
    situacao: str
    observacao_analise: Optional[str] = None
    documento_id: Optional[uuid.UUID] = None
    recebido_em: datetime


class ExternalUploadReview(BaseModel):
    acao: str = Field(description="aprovar | rejeitar | solicitar_correcao")
    observacao: Optional[str] = None
    pasta_destino_id: Optional[uuid.UUID] = None
    classificacao: Optional[str] = None


class PublicLinkView(BaseModel):
    nome: str
    descricao: Optional[str] = None
    instituicao: str
    expira_em: Optional[datetime] = None
    permitir_download: bool
    marca_dagua: bool
    termo_responsabilidade: Optional[str] = None
    exige_senha: bool
    exigir_nome: bool
    exigir_email: bool
    exigir_telefone: bool
    documentos: List[dict] = []


class PublicRequestView(BaseModel):
    titulo: str
    descricao: Optional[str] = None
    instituicao: str
    prazo: Optional[datetime] = None
    extensoes_aceitas: Optional[List[str]] = None
    tamanho_maximo_mb: int
    quantidade_maxima: int
    exige_senha: bool
    exigir_identificacao: bool
    exigir_email: bool
    termo_responsabilidade: Optional[str] = None
    observacoes: Optional[str] = None
