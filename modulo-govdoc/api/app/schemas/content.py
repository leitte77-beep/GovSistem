"""Schemas de pastas, documentos, versões, categorias, tags e comentários."""

import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.models.enums import Classification, DocumentStatus, FieldType


class FolderCreate(BaseModel):
    nome: str = Field(min_length=1, max_length=255)
    descricao: Optional[str] = None
    pasta_superior_id: Optional[uuid.UUID] = None
    secretaria_id: Optional[uuid.UUID] = None
    setor_id: Optional[uuid.UUID] = None
    responsavel_id: Optional[uuid.UUID] = None
    cor: str = "#1e40af"
    icone: str = "folder"
    classificacao: Classification = Classification.INTERNO
    permitir_compartilhamento_externo: bool = False
    politica_retencao_id: Optional[uuid.UUID] = None
    vencimento: Optional[date] = None
    observacoes: Optional[str] = None
    etiquetas: List[str] = []


class FolderUpdate(BaseModel):
    nome: Optional[str] = Field(default=None, min_length=1, max_length=255)
    descricao: Optional[str] = None
    responsavel_id: Optional[uuid.UUID] = None
    cor: Optional[str] = None
    icone: Optional[str] = None
    classificacao: Optional[Classification] = None
    permitir_compartilhamento_externo: Optional[bool] = None
    herdar_permissoes: Optional[bool] = None
    politica_retencao_id: Optional[uuid.UUID] = None
    vencimento: Optional[date] = None
    observacoes: Optional[str] = None
    etiquetas: Optional[List[str]] = None


class FolderMove(BaseModel):
    pasta_destino_id: Optional[uuid.UUID] = None


class FolderOut(BaseModel):
    id: uuid.UUID
    nome: str
    descricao: Optional[str] = None
    pasta_superior_id: Optional[uuid.UUID] = None
    secretaria_id: Optional[uuid.UUID] = None
    secretaria_nome: Optional[str] = None
    setor_id: Optional[uuid.UUID] = None
    setor_nome: Optional[str] = None
    responsavel_id: Optional[uuid.UUID] = None
    responsavel_nome: Optional[str] = None
    cor: str
    icone: str
    classificacao: str
    permitir_compartilhamento_externo: bool
    herdar_permissoes: bool
    vencimento: Optional[date] = None
    observacoes: Optional[str] = None
    profundidade: int
    total_subpastas: int = 0
    total_documentos: int = 0
    tamanho_bytes: int = 0
    favorito: bool = False
    permissoes: List[str] = []
    criado_em: datetime
    atualizado_em: datetime
    excluido_em: Optional[datetime] = None

    @classmethod
    def build(cls, folder, **extra) -> "FolderOut":
        return cls(
            id=folder.id,
            nome=folder.name,
            descricao=folder.description,
            pasta_superior_id=folder.parent_id,
            secretaria_id=folder.secretariat_id,
            setor_id=folder.department_id,
            responsavel_id=folder.owner_user_id,
            cor=folder.color,
            icone=folder.icon,
            classificacao=folder.classification,
            permitir_compartilhamento_externo=folder.allow_external_share,
            herdar_permissoes=folder.inherit_permissions,
            vencimento=folder.expires_on,
            observacoes=folder.notes,
            profundidade=folder.depth,
            criado_em=folder.created_at,
            atualizado_em=folder.updated_at,
            excluido_em=folder.deleted_at,
            **extra,
        )


class DocumentMetadata(BaseModel):
    nome_exibicao: Optional[str] = Field(default=None, max_length=300)
    descricao: Optional[str] = None
    assunto: Optional[str] = None
    categoria_id: Optional[uuid.UUID] = None
    numero_processo: Optional[str] = None
    numero_protocolo: Optional[str] = None
    numero_contrato: Optional[str] = None
    ano_referencia: Optional[int] = Field(default=None, ge=1900, le=2200)
    data_documento: Optional[date] = None
    data_validade: Optional[date] = None
    responsavel_id: Optional[uuid.UUID] = None
    autor: Optional[str] = None
    interessado: Optional[str] = None
    observacoes: Optional[str] = None
    classificacao: Optional[Classification] = None
    situacao: Optional[DocumentStatus] = None
    politica_retencao_id: Optional[uuid.UUID] = None
    etiquetas: Optional[List[str]] = None
    campos_personalizados: Optional[Dict[str, Any]] = None


class DocumentUpdate(DocumentMetadata):
    versao_controle: Optional[int] = None
    bloqueio_legal: Optional[bool] = None
    herdar_permissoes: Optional[bool] = None


class VersionOut(BaseModel):
    id: uuid.UUID
    numero: int
    nome_original: str
    extensao: Optional[str] = None
    mime: Optional[str] = None
    tamanho_bytes: int
    sha256: str
    descricao_alteracao: Optional[str] = None
    situacao_arquivo: str
    atual: bool
    restaurada_de: Optional[int] = None
    enviada_por_id: Optional[uuid.UUID] = None
    enviada_por_nome: Optional[str] = None
    criada_em: datetime

    @classmethod
    def build(cls, version, autor_nome: Optional[str] = None) -> "VersionOut":
        return cls(
            id=version.id,
            numero=version.version_number,
            nome_original=version.original_name,
            extensao=version.extension,
            mime=version.mime_type,
            tamanho_bytes=version.size_bytes,
            sha256=version.sha256,
            descricao_alteracao=version.change_note,
            situacao_arquivo=version.file_status,
            atual=version.is_current,
            restaurada_de=version.restored_from_version,
            enviada_por_id=version.uploaded_by_id,
            enviada_por_nome=autor_nome,
            criada_em=version.created_at,
        )


class DocumentOut(BaseModel):
    id: uuid.UUID
    codigo: str
    nome_exibicao: str
    nome_original: str
    descricao: Optional[str] = None
    assunto: Optional[str] = None
    pasta_id: uuid.UUID
    pasta_nome: Optional[str] = None
    secretaria_id: Optional[uuid.UUID] = None
    secretaria_nome: Optional[str] = None
    setor_id: Optional[uuid.UUID] = None
    setor_nome: Optional[str] = None
    categoria_id: Optional[uuid.UUID] = None
    categoria_nome: Optional[str] = None
    numero_processo: Optional[str] = None
    numero_protocolo: Optional[str] = None
    numero_contrato: Optional[str] = None
    ano_referencia: Optional[int] = None
    data_documento: Optional[date] = None
    data_validade: Optional[date] = None
    responsavel_id: Optional[uuid.UUID] = None
    responsavel_nome: Optional[str] = None
    autor: Optional[str] = None
    interessado: Optional[str] = None
    observacoes: Optional[str] = None
    classificacao: str
    situacao: str
    versao_atual: int
    tamanho_bytes: int
    mime: Optional[str] = None
    extensao: Optional[str] = None
    sha256: Optional[str] = None
    situacao_arquivo: str
    situacao_indexacao: str
    bloqueio_legal: bool
    herdar_permissoes: bool
    versao_controle: int
    atalho: bool = False
    atalho_para_id: Optional[uuid.UUID] = None
    total_visualizacoes: int = 0
    total_downloads: int = 0
    favorito: bool = False
    etiquetas: List[str] = []
    campos_personalizados: Dict[str, Any] = {}
    permissoes: List[str] = []
    criado_em: datetime
    atualizado_em: datetime
    excluido_em: Optional[datetime] = None
    excluido_por_nome: Optional[str] = None
    motivo_exclusao: Optional[str] = None

    @classmethod
    def build(cls, doc, **extra) -> "DocumentOut":
        return cls(
            id=doc.id,
            codigo=doc.code,
            nome_exibicao=doc.display_name,
            nome_original=doc.original_name,
            descricao=doc.description,
            assunto=doc.subject,
            pasta_id=doc.folder_id,
            secretaria_id=doc.secretariat_id,
            setor_id=doc.department_id,
            categoria_id=doc.category_id,
            numero_processo=doc.process_number,
            numero_protocolo=doc.protocol_number,
            numero_contrato=doc.contract_number,
            ano_referencia=doc.reference_year,
            data_documento=doc.document_date,
            data_validade=doc.expires_on,
            responsavel_id=doc.owner_user_id,
            autor=doc.author_name,
            interessado=doc.stakeholder_name,
            observacoes=doc.notes,
            classificacao=doc.classification,
            situacao=doc.status,
            versao_atual=doc.current_version_number,
            tamanho_bytes=doc.size_bytes,
            mime=doc.mime_type,
            extensao=doc.extension,
            sha256=doc.sha256,
            situacao_arquivo=doc.file_status,
            situacao_indexacao=doc.index_status,
            bloqueio_legal=doc.legal_hold,
            herdar_permissoes=doc.inherit_permissions,
            versao_controle=doc.row_version,
            atalho=doc.is_shortcut,
            atalho_para_id=doc.shortcut_target_id,
            total_visualizacoes=doc.view_count,
            total_downloads=doc.download_count,
            criado_em=doc.created_at,
            atualizado_em=doc.updated_at,
            excluido_em=doc.deleted_at,
            motivo_exclusao=doc.delete_reason,
            **extra,
        )


class UploadResponse(BaseModel):
    documento: DocumentOut
    versao: VersionOut
    aviso: Optional[str] = None
    duplicado: Optional[dict] = None


class DuplicateDecision(BaseModel):
    acao: str = Field(description="nova_versao | novo_documento | atalho | cancelar")
    documento_existente_id: Optional[uuid.UUID] = None


class MoveRequest(BaseModel):
    pasta_destino_id: uuid.UUID


class DeleteRequest(BaseModel):
    motivo: Optional[str] = None


class RestoreRequest(BaseModel):
    pasta_destino_id: Optional[uuid.UUID] = None


class VersionRestoreRequest(BaseModel):
    numero: int
    observacao: Optional[str] = None


class CategoryFieldIn(BaseModel):
    chave: str = Field(min_length=1, max_length=80)
    rotulo: str = Field(min_length=1, max_length=150)
    tipo: FieldType = FieldType.TEXTO
    obrigatorio: bool = False
    opcoes: Optional[List[str]] = None
    ajuda: Optional[str] = None
    posicao: int = 0


class CategoryCreate(BaseModel):
    nome: str = Field(min_length=2, max_length=150)
    descricao: Optional[str] = None
    cor: str = "#1e40af"
    icone: str = "file-text"
    retencao_dias: Optional[int] = None
    exige_vencimento: bool = False
    campos: List[CategoryFieldIn] = []


class CategoryOut(BaseModel):
    id: uuid.UUID
    nome: str
    slug: str
    descricao: Optional[str] = None
    cor: str
    icone: str
    retencao_dias: Optional[int] = None
    exige_vencimento: bool
    ativo: bool
    campos: List[dict] = []
    total_documentos: int = 0


class TagOut(BaseModel):
    id: uuid.UUID
    nome: str
    slug: str
    cor: str
    total: int = 0


class CommentCreate(BaseModel):
    texto: str = Field(min_length=1, max_length=5000)
    responde_a: Optional[uuid.UUID] = None
    mencionados: List[uuid.UUID] = []


class CommentOut(BaseModel):
    id: uuid.UUID
    texto: str
    autor_id: uuid.UUID
    autor_nome: Optional[str] = None
    responde_a: Optional[uuid.UUID] = None
    resolvido: bool = False
    criado_em: datetime
    editado_em: Optional[datetime] = None
    mencionados: List[uuid.UUID] = []


class LockRequest(BaseModel):
    motivo: Optional[str] = None
