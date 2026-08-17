import uuid
from datetime import date, datetime

from pydantic import Field

from app.schemas.comuns import Base


class EditalIn(Base):
    template_id: uuid.UUID | None = None
    numero: str
    modalidade: str
    criterio_julgamento: str | None = None
    conteudo: str | None = None


class EditalOut(EditalIn):
    id: uuid.UUID
    processo_id: uuid.UUID
    status: str


class PublicacaoIn(Base):
    veiculo: str
    data_publicacao: date
    horario: str | None = None
    link: str | None = None


class PublicacaoOut(PublicacaoIn):
    id: uuid.UUID


class SessaoIn(Base):
    data_hora: datetime
    tipo: str = "abertura"
    plataforma: str | None = None
    participantes: str | None = None
    ocorrencias: str | None = None


class SessaoOut(SessaoIn):
    id: uuid.UUID
    situacao: str


class PropostaIn(Base):
    fornecedor_id: uuid.UUID
    valor_proposto: float = Field(..., gt=0)
    situacao: str = "classificada"
    observacoes: str | None = None


class PropostaOut(PropostaIn):
    id: uuid.UUID


class AdjudicarIn(Base):
    fornecedor_vencedor_id: uuid.UUID
    valor_adjudicado: float = Field(..., gt=0)
    observacao: str | None = None


class HomologarIn(Base):
    valor_homologado: float = Field(..., gt=0)


class HomologacaoOut(Base):
    id: uuid.UUID
    autoridade_usuario_id: uuid.UUID
    valor_homologado: float
    publicada_em: datetime | None = None
