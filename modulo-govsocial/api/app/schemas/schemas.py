import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.core.br_validators import only_digits, validate_cep, validate_cpf


# ── Auth ──────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    login: str = Field(..., description="CPF (somente dígitos) ou e-mail")
    password: str


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: dict


class RefreshRequest(BaseModel):
    refresh_token: str


class UserMeResponse(BaseModel):
    id: str
    email: str
    name: str
    roles: list[dict]
    organization_id: str | None


# ── Units ─────────────────────────────────────────────────────────
class UnitCreate(BaseModel):
    tipo: str = Field(..., max_length=20)
    nome: str = Field(..., max_length=255)
    cnpj: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    municipio: Optional[str] = None
    uf: Optional[str] = Field(None, max_length=2)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    territorios: Optional[list[str]] = None

    @field_validator("cep")
    @classmethod
    def _cep(cls, v):
        if v and not validate_cep(v):
            raise ValueError("CEP inválido")
        return only_digits(v) or None


class UnitUpdate(BaseModel):
    tipo: Optional[str] = Field(None, max_length=20)
    nome: Optional[str] = Field(None, max_length=255)
    cnpj: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    municipio: Optional[str] = None
    uf: Optional[str] = Field(None, max_length=2)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    territorios: Optional[list[str]] = None
    is_active: Optional[bool] = None

    @field_validator("cep")
    @classmethod
    def _cep(cls, v):
        if v and not validate_cep(v):
            raise ValueError("CEP inválido")
        return only_digits(v) or None


class UnitOut(BaseModel):
    id: uuid.UUID
    tipo: str
    nome: str
    cnpj: Optional[str]
    telefone: Optional[str]
    email: Optional[str]
    cep: Optional[str]
    logradouro: Optional[str]
    numero: Optional[str]
    complemento: Optional[str]
    bairro: Optional[str]
    municipio: Optional[str]
    uf: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    territorios: Optional[list]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Professionals ─────────────────────────────────────────────────
class ProfessionalCreate(BaseModel):
    nome: str = Field(..., max_length=255)
    cpf: str = Field(..., description="CPF com DV válido")
    funcao_nob_rh: Optional[str] = None
    conselho_classe_tipo: Optional[str] = None
    conselho_classe_numero: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    user_id: Optional[uuid.UUID] = None

    @field_validator("cpf")
    @classmethod
    def _cpf(cls, v):
        if not validate_cpf(v):
            raise ValueError("CPF inválido")
        return only_digits(v)


class ProfessionalUpdate(BaseModel):
    nome: Optional[str] = Field(None, max_length=255)
    funcao_nob_rh: Optional[str] = None
    conselho_classe_tipo: Optional[str] = None
    conselho_classe_numero: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    user_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None


class AssignmentOut(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    funcao_no_local: Optional[str]
    data_inicio: date
    data_fim: Optional[date]
    is_current: bool

    model_config = {"from_attributes": True}


class AssignmentCreate(BaseModel):
    unit_id: uuid.UUID
    funcao_no_local: Optional[str] = None
    data_inicio: date
    data_fim: Optional[date] = None


class AssignmentUpdate(BaseModel):
    funcao_no_local: Optional[str] = None
    data_fim: Optional[date] = None


class ProfessionalListItem(BaseModel):
    """CPF mascarado em listagens (LGPD)."""

    id: uuid.UUID
    nome: str
    cpf_mascarado: Optional[str]
    funcao_nob_rh: Optional[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ProfessionalOut(BaseModel):
    id: uuid.UUID
    nome: str
    cpf_mascarado: Optional[str]
    funcao_nob_rh: Optional[str]
    conselho_classe_tipo: Optional[str]
    conselho_classe_numero: Optional[str]
    email: Optional[str]
    telefone: Optional[str]
    user_id: Optional[uuid.UUID]
    is_active: bool
    assignments: list[AssignmentOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Domains ───────────────────────────────────────────────────────
class DomainItemOut(BaseModel):
    id: uuid.UUID
    code: str
    nome: str
    source: str
    vigencia_inicio: date
    vigencia_fim: Optional[date]
    ativo: bool

    model_config = {"from_attributes": True}


class ServiceTypeOut(DomainItemOut):
    sigla: Optional[str] = None
    protecao: Optional[str] = None


class ReferralCodeOut(DomainItemOut):
    area: Optional[str] = None


class BenefitTypeOut(DomainItemOut):
    categoria: Optional[str] = None
    unidade_medida: Optional[str] = None
    exige_parecer: bool = True
    periodicidade_max_dias: Optional[int] = None


class DomainCreate(BaseModel):
    code: str = Field(..., max_length=40)
    nome: str = Field(..., max_length=255)
    vigencia_inicio: date
    vigencia_fim: Optional[date] = None
    ativo: bool = True
    # campos específicos opcionais
    sigla: Optional[str] = None
    protecao: Optional[str] = None
    area: Optional[str] = None
    categoria: Optional[str] = None
    unidade_medida: Optional[str] = None
    exige_parecer: Optional[bool] = None
    periodicidade_max_dias: Optional[int] = None


# ── Audit ─────────────────────────────────────────────────────────
class AuditOut(BaseModel):
    id: uuid.UUID
    occurred_at: datetime
    actor_user_id: Optional[uuid.UUID]
    actor_role: Optional[str]
    action: str
    access_type: str
    entity: str
    entity_id: Optional[str]
    ip_address: Optional[str]
    request_id: Optional[str]
    diff_summary: Optional[dict]

    model_config = {"from_attributes": True}
