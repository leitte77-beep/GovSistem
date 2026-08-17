import uuid

from pydantic import Field

from app.schemas.comuns import Base


class RequisitoIn(Base):
    tipo: str = "manual_check"
    descricao: str = Field(..., min_length=3, max_length=300)
    entidade_ref: str | None = None
    obrigatorio: bool = True


class RequisitoOut(Base):
    id: uuid.UUID
    tipo: str
    descricao: str
    entidade_ref: str | None = None
    obrigatorio: bool


class TransicaoIn(Base):
    etapa_destino_id: uuid.UUID | None = None
    tipo: str = "avancar"
    rotulo: str | None = None
    exige_justificativa: bool = False


class TransicaoOut(Base):
    id: uuid.UUID
    etapa_destino_id: uuid.UUID | None = None
    tipo: str
    rotulo: str | None = None
    exige_justificativa: bool


class EtapaIn(Base):
    ordem: int
    codigo: str = Field(..., min_length=2, max_length=60)
    nome: str = Field(..., min_length=2, max_length=200)
    tipo_etapa: str = "manual"
    setor_papel_funcional: str | None = None
    perfil_responsavel: str | None = None
    sla_dias: int = 5
    etapa_final: bool = False
    cancelavel: bool = True


class EtapaOut(Base):
    id: uuid.UUID
    ordem: int
    codigo: str
    nome: str
    tipo_etapa: str
    setor_papel_funcional: str | None = None
    perfil_responsavel: str | None = None
    sla_dias: int
    etapa_final: bool
    cancelavel: bool
    requisitos: list[RequisitoOut] = []
    transicoes_saida: list[TransicaoOut] = []


class TemplateIn(Base):
    tipo_processo: str
    nome: str = Field(..., min_length=3, max_length=200)
    descricao: str | None = None


class TemplateOut(Base):
    id: uuid.UUID
    tipo_processo: str
    nome: str
    descricao: str | None = None
    versao: int
    ativo: bool
    etapas: list[EtapaOut] = []
