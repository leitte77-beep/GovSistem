import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.core.br_validators import only_digits, validate_cpf, validate_nis


# ── Person ────────────────────────────────────────────────────────
class DeficienciaIn(BaseModel):
    tipo: Optional[str] = None
    detalhe: Optional[str] = Field(
        None, description="Detalhe sensível — criptografado em repouso"
    )


class PersonCreate(BaseModel):
    nome_civil: str = Field(..., max_length=255)
    nome_social: Optional[str] = Field(None, max_length=255)
    cpf: Optional[str] = None
    nis: Optional[str] = None
    data_nascimento: Optional[date] = None
    sexo: Optional[str] = None
    escolaridade: Optional[str] = None
    ocupacao: Optional[str] = None
    tipo_deficiencia: Optional[str] = None
    deficiencia_detalhe: Optional[str] = None
    raca_cor: Optional[str] = None
    estado_civil: Optional[str] = None
    frequenta_escola: Optional[bool] = None
    situacao_mercado_trabalho: Optional[str] = None
    gestante: Optional[bool] = None
    amamentando: Optional[bool] = None
    renda_mensal: Optional[float] = None
    documentos: Optional[dict] = None
    # vínculo familiar opcional na criação
    family_id: Optional[uuid.UUID] = None
    parentesco: Optional[str] = None
    confirmar_duplicata: bool = Field(
        False, description="Confirma criação mesmo com possível duplicata"
    )

    @field_validator("cpf")
    @classmethod
    def _cpf(cls, v):
        if v:
            if not validate_cpf(v):
                raise ValueError("CPF inválido")
            return only_digits(v)
        return None

    @field_validator("nis")
    @classmethod
    def _nis(cls, v):
        if v:
            if not validate_nis(v):
                raise ValueError("NIS inválido")
            return only_digits(v)
        return None


class PersonUpdate(BaseModel):
    nome_civil: Optional[str] = Field(None, max_length=255)
    nome_social: Optional[str] = Field(None, max_length=255)
    cpf: Optional[str] = None
    nis: Optional[str] = None
    data_nascimento: Optional[date] = None
    sexo: Optional[str] = None
    escolaridade: Optional[str] = None
    ocupacao: Optional[str] = None
    tipo_deficiencia: Optional[str] = None
    deficiencia_detalhe: Optional[str] = None
    raca_cor: Optional[str] = None
    estado_civil: Optional[str] = None
    frequenta_escola: Optional[bool] = None
    situacao_mercado_trabalho: Optional[str] = None
    gestante: Optional[bool] = None
    amamentando: Optional[bool] = None
    renda_mensal: Optional[float] = None
    documentos: Optional[dict] = None
    is_falecido: Optional[bool] = None

    @field_validator("cpf")
    @classmethod
    def _cpf(cls, v):
        if v:
            if not validate_cpf(v):
                raise ValueError("CPF inválido")
            return only_digits(v)
        return None

    @field_validator("nis")
    @classmethod
    def _nis(cls, v):
        if v:
            if not validate_nis(v):
                raise ValueError("NIS inválido")
            return only_digits(v)
        return None


class PersonListItem(BaseModel):
    """CPF/NIS mascarados (LGPD). Exibe nome social com precedência."""

    id: uuid.UUID
    nome_exibicao: str
    nome_civil: str
    cpf_mascarado: Optional[str]
    nis_mascarado: Optional[str]
    data_nascimento: Optional[date]
    is_falecido: bool


class PersonOut(BaseModel):
    id: uuid.UUID
    nome_civil: str
    nome_social: Optional[str]
    nome_exibicao: str
    cpf_mascarado: Optional[str]
    nis_mascarado: Optional[str]
    data_nascimento: Optional[date]
    sexo: Optional[str]
    escolaridade: Optional[str]
    ocupacao: Optional[str]
    tipo_deficiencia: Optional[str]
    deficiencia_detalhe: Optional[str]
    raca_cor: Optional[str]
    estado_civil: Optional[str]
    frequenta_escola: Optional[bool]
    situacao_mercado_trabalho: Optional[str]
    gestante: Optional[bool]
    amamentando: Optional[bool]
    renda_mensal: Optional[float]
    documentos: Optional[dict]
    is_falecido: bool
    created_at: datetime
    updated_at: datetime


class DuplicateCandidate(BaseModel):
    id: uuid.UUID
    nome_exibicao: str
    cpf_mascarado: Optional[str]
    data_nascimento: Optional[date]


class PersonCreateResult(BaseModel):
    created: bool
    person: Optional[PersonOut] = None
    duplicates: list[DuplicateCandidate] = []


class MergeRequest(BaseModel):
    keep_id: uuid.UUID
    drop_id: uuid.UUID
    justificativa: str = Field(..., min_length=5, max_length=500)


# ── Family ────────────────────────────────────────────────────────
class FamilyCreate(BaseModel):
    nis_responsavel: Optional[str] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    municipio: Optional[str] = None
    uf: Optional[str] = Field(None, max_length=2)
    ponto_referencia: Optional[str] = None
    telefone_contato: Optional[str] = None
    situacao_rua: bool = False
    data_cadastramento: Optional[date] = None
    despesa_aluguel: Optional[float] = None
    despesa_transporte: Optional[float] = None
    despesa_alimentacao: Optional[float] = None
    despesa_medicamentos: Optional[float] = None
    despesa_outros: Optional[float] = None
    faixa_renda: Optional[str] = None
    no_cadunico: bool = False
    cadunico_atualizado_em: Optional[date] = None
    beneficiaria_pbf: bool = False
    possui_bpc: bool = False
    inseguranca_alimentar: bool = False

    @field_validator("nis_responsavel")
    @classmethod
    def _nis(cls, v):
        if v:
            if not validate_nis(v):
                raise ValueError("NIS do responsável inválido")
            return only_digits(v)
        return None


class FamilyUpdate(BaseModel):
    responsavel_id: Optional[uuid.UUID] = None
    nis_responsavel: Optional[str] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    municipio: Optional[str] = None
    uf: Optional[str] = Field(None, max_length=2)
    ponto_referencia: Optional[str] = None
    telefone_contato: Optional[str] = None
    situacao_rua: Optional[bool] = None
    data_cadastramento: Optional[date] = None
    despesa_aluguel: Optional[float] = None
    despesa_transporte: Optional[float] = None
    despesa_alimentacao: Optional[float] = None
    despesa_medicamentos: Optional[float] = None
    despesa_outros: Optional[float] = None
    faixa_renda: Optional[str] = None
    no_cadunico: Optional[bool] = None
    cadunico_atualizado_em: Optional[date] = None
    beneficiaria_pbf: Optional[bool] = None
    possui_bpc: Optional[bool] = None
    inseguranca_alimentar: Optional[bool] = None

    @field_validator("nis_responsavel")
    @classmethod
    def _nis(cls, v):
        if v:
            if not validate_nis(v):
                raise ValueError("NIS do responsável inválido")
            return only_digits(v)
        return None


class MemberOut(BaseModel):
    membership_id: uuid.UUID
    person_id: uuid.UUID
    nome_exibicao: str
    parentesco: Optional[str]
    status: str
    data_entrada: date
    data_saida: Optional[date]
    is_responsavel: bool


class FamilyListItem(BaseModel):
    id: uuid.UUID
    codigo: int
    responsavel_nome: Optional[str]
    nis_responsavel_mascarado: Optional[str]
    bairro: Optional[str]
    territorio: Optional[str]
    faixa_renda: Optional[str]
    beneficiaria_pbf: bool
    created_at: datetime


class FamilyOut(BaseModel):
    id: uuid.UUID
    codigo: int
    responsavel_id: Optional[uuid.UUID]
    responsavel_nome: Optional[str]
    nis_responsavel_mascarado: Optional[str]
    cep: Optional[str]
    logradouro: Optional[str]
    numero: Optional[str]
    complemento: Optional[str]
    bairro: Optional[str]
    municipio: Optional[str]
    uf: Optional[str]
    ponto_referencia: Optional[str] = None
    telefone_contato: Optional[str] = None
    situacao_rua: bool = False
    data_cadastramento: Optional[date] = None
    despesa_aluguel: Optional[float] = None
    despesa_transporte: Optional[float] = None
    despesa_alimentacao: Optional[float] = None
    despesa_medicamentos: Optional[float] = None
    despesa_outros: Optional[float] = None
    latitude: Optional[float]
    longitude: Optional[float]
    geocode_status: str
    territorio: Optional[str]
    faixa_renda: Optional[str]
    no_cadunico: bool
    cadunico_atualizado_em: Optional[date]
    beneficiaria_pbf: bool
    possui_bpc: bool
    inseguranca_alimentar: bool
    membros: list[MemberOut] = []
    created_at: datetime
    updated_at: datetime


class AddMemberRequest(BaseModel):
    person_id: uuid.UUID
    parentesco: Optional[str] = None
    data_entrada: Optional[date] = None
    definir_responsavel: bool = False


class UpdateMemberRequest(BaseModel):
    """Atualiza o vínculo com a família (não os dados da pessoa)."""

    parentesco: Optional[str] = None


class MoveMemberRequest(BaseModel):
    """Transfere um membro para outra família, mantendo histórico."""

    destino_family_id: uuid.UUID
    parentesco: Optional[str] = None
    motivo: Optional[str] = None
    data_movimento: Optional[date] = None


class UnifiedSearchItem(BaseModel):
    person_id: uuid.UUID
    nome_exibicao: str
    cpf_mascarado: Optional[str]
    nis_mascarado: Optional[str]
    data_nascimento: Optional[date]
    familias: list[dict] = []
