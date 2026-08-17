"""Schemas de autenticação (SSO e login de demonstração)."""

from pydantic import Field

from app.schemas.comuns import Base


class DevSessionRequest(Base):
    access_token: str


class DevLoginRequest(Base):
    # `str`, não `EmailStr`: as personas de demonstração usam o domínio
    # reservado `.local` (seção 128), que o validador RFC de e-mail rejeita.
    email: str = Field(..., min_length=3, max_length=200)
    senha: str = Field(..., min_length=1)


class PersonaOut(Base):
    email: str
    nome: str
    perfil: str
    cargo: str | None = None


class UsuarioAtualOut(Base):
    id: str
    nome: str
    email: str
    perfil: str
    setor_id: str | None = None
    organizacao_id: str
    permissoes: list[str]


class TokenOut(Base):
    token: str
    usuario: UsuarioAtualOut
