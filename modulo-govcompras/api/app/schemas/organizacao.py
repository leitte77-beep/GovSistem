import uuid

from pydantic import Field

from app.schemas.comuns import Base


class SecretariaIn(Base):
    nome: str = Field(..., min_length=2, max_length=200)
    sigla: str = Field(..., min_length=1, max_length=30)


class SecretariaOut(Base):
    id: uuid.UUID
    nome: str
    sigla: str
    ativa: bool


class SetorIn(Base):
    secretaria_id: uuid.UUID
    nome: str = Field(..., min_length=2, max_length=200)
    sigla: str = Field(..., min_length=1, max_length=30)
    papel_funcional: str | None = None


class SetorOut(Base):
    id: uuid.UUID
    secretaria_id: uuid.UUID
    nome: str
    sigla: str
    papel_funcional: str | None = None
    ativo: bool


class UsuarioIn(Base):
    nome: str = Field(..., min_length=2, max_length=200)
    email: str
    setor_id: uuid.UUID | None = None
    perfil: str
    cargo: str | None = None


class UsuarioUpdate(Base):
    setor_id: uuid.UUID | None = None
    perfil: str | None = None
    cargo: str | None = None
    ativo: bool | None = None
    permissoes_extras: list[str] | None = None
    permissoes_revogadas: list[str] | None = None


class UsuarioOut(Base):
    id: uuid.UUID
    nome: str
    email: str
    perfil: str
    setor_id: uuid.UUID | None = None
    cargo: str | None = None
    ativo: bool
