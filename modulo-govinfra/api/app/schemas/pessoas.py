"""Schemas de pessoas, imóveis e bloqueios."""

import uuid
from datetime import date, datetime

from pydantic import Field, field_validator

from app.core.br_validators import (
    apenas_digitos,
    cnpj_valido,
    cpf_valido,
    normalizar_cep,
    normalizar_telefone,
)
from app.schemas.comuns import Base


class PessoaEntrada(Base):
    nome: str = Field(..., min_length=3, max_length=200)
    nome_social: str | None = Field(None, max_length=200)
    documento: str | None = Field(None, description="CPF ou CNPJ, com ou sem pontuação")
    pessoa_juridica: bool = False
    rg: str | None = Field(None, max_length=30)
    orgao_expedidor: str | None = Field(None, max_length=30)
    data_nascimento: date | None = None

    telefone: str | None = None
    whatsapp: str | None = None
    email: str | None = Field(None, max_length=200)

    cep: str | None = None
    logradouro: str | None = Field(None, max_length=200)
    numero: str | None = Field(None, max_length=20)
    complemento: str | None = Field(None, max_length=120)
    bairro: str | None = Field(None, max_length=120)
    municipio: str | None = Field(None, max_length=120)
    uf: str | None = Field(None, max_length=2)

    tipos: list[str] = []
    observacoes: str | None = None
    # Confirmação explícita do atendente diante de um alerta de duplicidade.
    confirmar_duplicidade: bool = False

    @field_validator("documento")
    @classmethod
    def _validar_documento(cls, valor: str | None) -> str | None:
        if not valor:
            return None
        numeros = apenas_digitos(valor)
        if len(numeros) == 11:
            if not cpf_valido(numeros):
                raise ValueError("CPF inválido — confira os dígitos digitados.")
        elif len(numeros) == 14:
            if not cnpj_valido(numeros):
                raise ValueError("CNPJ inválido — confira os dígitos digitados.")
        else:
            raise ValueError("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).")
        return numeros

    @field_validator("telefone", "whatsapp")
    @classmethod
    def _normalizar_telefone(cls, valor: str | None) -> str | None:
        if not valor:
            return None
        numeros = normalizar_telefone(valor)
        if len(numeros) not in (10, 11):
            raise ValueError("Telefone inválido — informe DDD e número.")
        return numeros

    @field_validator("cep")
    @classmethod
    def _normalizar_cep(cls, valor: str | None) -> str | None:
        if not valor:
            return None
        numeros = normalizar_cep(valor)
        return numeros or None

    @field_validator("uf")
    @classmethod
    def _uf_maiuscula(cls, valor: str | None) -> str | None:
        return valor.upper() if valor else None


class PessoaAtualizacao(PessoaEntrada):
    nome: str | None = Field(None, min_length=3, max_length=200)
    situacao: str | None = None


class PessoaResumo(Base):
    id: uuid.UUID
    nome: str
    # Mascarado quando o usuário não tem `govinfra.pessoas.ver_cpf`.
    documento: str | None = None
    documento_mascarado: bool = True
    telefone: str | None = None
    bairro: str | None = None
    municipio: str | None = None
    situacao: str
    tipos: list[str] = []


class PessoaDetalhe(PessoaResumo):
    nome_social: str | None = None
    pessoa_juridica: bool = False
    rg: str | None = None
    data_nascimento: date | None = None
    whatsapp: str | None = None
    email: str | None = None
    cep: str | None = None
    logradouro: str | None = None
    numero: str | None = None
    complemento: str | None = None
    uf: str | None = None
    observacoes: str | None = None
    created_at: datetime
    imoveis: list["ImovelResumo"] = []
    bloqueios_ativos: int = 0


class DuplicidadeOut(Base):
    """Alerta de possível cadastro repetido (item 8.2)."""

    tipo: str
    mensagem: str
    pessoa_id: uuid.UUID
    nome: str


class ImovelEntrada(Base):
    nome: str | None = Field(None, max_length=200)
    tipo: str = "urbano"
    proprietario_id: uuid.UUID | None = None
    solicitante_id: uuid.UUID | None = None
    relacao_solicitante: str | None = None

    cep: str | None = None
    logradouro: str | None = Field(None, max_length=200)
    numero: str | None = Field(None, max_length=20)
    complemento: str | None = Field(None, max_length=120)
    bairro: str | None = Field(None, max_length=120)
    comunidade: str | None = Field(None, max_length=150)
    estrada_acesso: str | None = Field(None, max_length=200)
    municipio: str | None = Field(None, max_length=120)
    uf: str | None = Field(None, max_length=2)
    regiao_id: uuid.UUID | None = None

    lote: str | None = None
    matricula: str | None = None
    inscricao_municipal: str | None = None
    cadastro_rural: str | None = None
    area_hectares: float | None = Field(None, ge=0)
    atividade_produtiva: str | None = Field(None, max_length=200)

    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    precisao_coordenada: str | None = None

    instrucoes_acesso: str | None = None
    observacoes: str | None = None

    @field_validator("cep")
    @classmethod
    def _cep(cls, valor: str | None) -> str | None:
        return normalizar_cep(valor) or None if valor else None


class ImovelResumo(Base):
    id: uuid.UUID
    codigo: str
    nome: str | None = None
    tipo: str
    logradouro: str | None = None
    numero: str | None = None
    bairro: str | None = None
    comunidade: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    situacao: str


class ImovelDetalhe(ImovelResumo):
    cep: str | None = None
    complemento: str | None = None
    estrada_acesso: str | None = None
    municipio: str | None = None
    uf: str | None = None
    regiao_id: uuid.UUID | None = None
    lote: str | None = None
    matricula: str | None = None
    inscricao_municipal: str | None = None
    cadastro_rural: str | None = None
    area_hectares: float | None = None
    atividade_produtiva: str | None = None
    precisao_coordenada: str | None = None
    instrucoes_acesso: str | None = None
    observacoes: str | None = None
    proprietario: PessoaResumo | None = None
    solicitante: PessoaResumo | None = None
    created_at: datetime
    bloqueios_ativos: int = 0


class VinculoEntrada(Base):
    pessoa_id: uuid.UUID
    relacao: str = "proprietario"
    principal: bool = False
    observacao: str | None = None


class GeocodificacaoEntrada(Base):
    endereco: str = Field(..., min_length=4, max_length=300)


class GeocodificacaoOut(Base):
    encontrado: bool
    latitude: float | None = None
    longitude: float | None = None
    endereco_formatado: str | None = None
    precisao: str | None = None
    provedor: str | None = None
    # Mensagem exibida quando o serviço externo está indisponível — o cadastro
    # segue normalmente pela marcação manual.
    mensagem: str | None = None


class BloqueioEntrada(Base):
    pessoa_id: uuid.UUID | None = None
    imovel_id: uuid.UUID | None = None
    motivo_id: uuid.UUID | None = None
    servico_afetado: str = "todos"
    tipo: str = "temporario"
    descricao: str | None = None
    data_inicio: date
    data_fim: date | None = None
    observacoes: str | None = None


class BloqueioOut(Base):
    id: uuid.UUID
    pessoa_id: uuid.UUID | None = None
    pessoa_nome: str | None = None
    imovel_id: uuid.UUID | None = None
    imovel_codigo: str | None = None
    motivo: str | None = None
    servico_afetado: str
    tipo: str
    descricao: str | None = None
    data_inicio: date
    data_fim: date | None = None
    situacao: str
    observacoes: str | None = None
    criado_por: str | None = None
    created_at: datetime
    revogado_em: datetime | None = None
    justificativa_revogacao: str | None = None


class MotivoBloqueioEntrada(Base):
    chave: str = Field(..., min_length=2, max_length=60)
    nome: str = Field(..., min_length=3, max_length=150)
    descricao: str | None = None
    servico_padrao: str = "todos"
    tipo_padrao: str = "temporario"
    dias_padrao: int | None = Field(None, ge=1, le=3650)
    exige_documento: bool = False
    ativo: bool = True
    ordem: int = 0


PessoaDetalhe.model_rebuild()
