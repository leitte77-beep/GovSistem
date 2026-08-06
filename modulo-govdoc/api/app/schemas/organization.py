"""Schemas de instituição, secretarias e setores."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.common import Email


class SecretariatCreate(BaseModel):
    nome: str = Field(min_length=2, max_length=200)
    sigla: str = Field(min_length=1, max_length=30)
    descricao: Optional[str] = None
    responsavel: Optional[str] = None
    responsavel_id: Optional[uuid.UUID] = None
    email: Optional[Email] = None
    telefone: Optional[str] = None
    cor: str = "#1e40af"
    icone: str = "building"
    limite_armazenamento_mb: Optional[int] = Field(default=None, ge=0)


class SecretariatUpdate(BaseModel):
    nome: Optional[str] = Field(default=None, min_length=2, max_length=200)
    sigla: Optional[str] = Field(default=None, min_length=1, max_length=30)
    descricao: Optional[str] = None
    responsavel: Optional[str] = None
    responsavel_id: Optional[uuid.UUID] = None
    email: Optional[Email] = None
    telefone: Optional[str] = None
    cor: Optional[str] = None
    icone: Optional[str] = None
    limite_armazenamento_mb: Optional[int] = Field(default=None, ge=0)
    ativo: Optional[bool] = None


class SecretariatOut(BaseModel):
    id: uuid.UUID
    nome: str
    sigla: str
    descricao: Optional[str] = None
    responsavel: Optional[str] = None
    responsavel_id: Optional[uuid.UUID] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    cor: str
    icone: str
    ativo: bool
    limite_armazenamento_bytes: Optional[int] = None
    consumo_bytes: Optional[int] = None
    total_setores: int = 0
    total_documentos: int = 0
    total_usuarios: int = 0
    criado_em: datetime
    criado_por: Optional[uuid.UUID] = None
    atualizado_em: datetime

    @classmethod
    def build(cls, item, **extra) -> "SecretariatOut":
        return cls(
            id=item.id,
            nome=item.name,
            sigla=item.acronym,
            descricao=item.description,
            responsavel=item.manager_name,
            responsavel_id=item.manager_user_id,
            email=item.email,
            telefone=item.phone,
            cor=item.color,
            icone=item.icon,
            ativo=item.is_active,
            limite_armazenamento_bytes=item.storage_limit_bytes,
            criado_em=item.created_at,
            criado_por=item.created_by_id,
            atualizado_em=item.updated_at,
            **extra,
        )


class DepartmentCreate(BaseModel):
    secretaria_id: uuid.UUID
    nome: str = Field(min_length=2, max_length=200)
    sigla: Optional[str] = Field(default=None, max_length=30)
    descricao: Optional[str] = None
    responsavel: Optional[str] = None
    responsavel_id: Optional[uuid.UUID] = None
    limite_armazenamento_mb: Optional[int] = Field(default=None, ge=0)


class DepartmentUpdate(BaseModel):
    secretaria_id: Optional[uuid.UUID] = None
    nome: Optional[str] = Field(default=None, min_length=2, max_length=200)
    sigla: Optional[str] = Field(default=None, max_length=30)
    descricao: Optional[str] = None
    responsavel: Optional[str] = None
    responsavel_id: Optional[uuid.UUID] = None
    limite_armazenamento_mb: Optional[int] = Field(default=None, ge=0)
    ativo: Optional[bool] = None


class DepartmentOut(BaseModel):
    id: uuid.UUID
    secretaria_id: uuid.UUID
    secretaria_nome: Optional[str] = None
    nome: str
    sigla: Optional[str] = None
    descricao: Optional[str] = None
    responsavel: Optional[str] = None
    responsavel_id: Optional[uuid.UUID] = None
    ativo: bool
    limite_armazenamento_bytes: Optional[int] = None
    consumo_bytes: Optional[int] = None
    total_documentos: int = 0
    total_usuarios: int = 0
    criado_em: datetime

    @classmethod
    def build(cls, item, **extra) -> "DepartmentOut":
        return cls(
            id=item.id,
            secretaria_id=item.secretariat_id,
            nome=item.name,
            sigla=item.acronym,
            descricao=item.description,
            responsavel=item.manager_name,
            responsavel_id=item.manager_user_id,
            ativo=item.is_active,
            limite_armazenamento_bytes=item.storage_limit_bytes,
            criado_em=item.created_at,
            **extra,
        )


class InstitutionOut(BaseModel):
    id: uuid.UUID
    nome: str
    sigla: Optional[str] = None
    cnpj: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    cor_primaria: str
    cor_destaque: str
    limite_armazenamento_bytes: Optional[int] = None
    ultima_sincronizacao: Optional[datetime] = None


class InstitutionUpdate(BaseModel):
    """Identidade (nome, CNPJ, contatos) vem da plataforma SaaS — aqui apenas
    o que é local ao módulo: aparência e limite de armazenamento."""

    cor_primaria: Optional[str] = None
    cor_destaque: Optional[str] = None
    limite_armazenamento_mb: Optional[int] = Field(default=None, ge=0)
