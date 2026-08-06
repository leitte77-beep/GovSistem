"""Schemas de autenticação e usuários."""

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import Profile


class DevSessionRequest(BaseModel):
    """Token de acesso da plataforma GovSistem enviado pela ponte de dev."""

    access_token: str = Field(min_length=10)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str
    email: str
    perfil: str
    secretaria_id: Optional[uuid.UUID] = None
    setor_id: Optional[uuid.UUID] = None
    cargo: Optional[str] = None
    ativo: bool
    ultimo_acesso: Optional[datetime] = None

    @classmethod
    def build(cls, user) -> "UserOut":
        return cls(
            id=user.id,
            nome=user.name,
            email=user.email,
            perfil=user.profile,
            secretaria_id=user.secretariat_id,
            setor_id=user.department_id,
            cargo=user.job_title,
            ativo=user.is_active,
            ultimo_acesso=user.last_login_at,
        )


class MeResponse(BaseModel):
    usuario: UserOut
    instituicao: dict
    permissoes_globais: List[str]


class UserUpdate(BaseModel):
    nome: Optional[str] = Field(default=None, min_length=2, max_length=200)
    perfil: Optional[Profile] = None
    secretaria_id: Optional[uuid.UUID] = None
    setor_id: Optional[uuid.UUID] = None
    cargo: Optional[str] = None
    telefone: Optional[str] = None
    ativo: Optional[bool] = None


class GroupCreate(BaseModel):
    nome: str = Field(min_length=2, max_length=150)
    descricao: Optional[str] = None
    membros: List[uuid.UUID] = []


class GroupOut(BaseModel):
    id: uuid.UUID
    nome: str
    descricao: Optional[str] = None
    membros: List[UserOut] = []
