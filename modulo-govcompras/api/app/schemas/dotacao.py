import uuid

from pydantic import Field

from app.schemas.comuns import Base


class DotacaoIn(Base):
    exercicio: int
    orgao: str
    unidade: str
    funcao: str | None = None
    subfuncao: str | None = None
    programa: str | None = None
    projeto_atividade: str | None = None
    elemento_despesa: str
    fonte: str | None = None
    conta: str | None = None
    valor_total: float = Field(..., gt=0)


class DotacaoOut(DotacaoIn):
    id: uuid.UUID
    valor_comprometido: float
    saldo: float


class VincularDotacaoIn(Base):
    dotacao_id: uuid.UUID
    valor_reservado: float = Field(..., gt=0)


class DecidirDotacaoIn(Base):
    status: str
    justificativa_devolucao: str | None = None


class ProcessoDotacaoOut(Base):
    id: uuid.UUID
    dotacao_id: uuid.UUID
    valor_reservado: float
    status: str
    justificativa_devolucao: str | None = None


class AutorizacaoIn(Base):
    decisao: str
    justificativa: str | None = None


class AutorizacaoOut(AutorizacaoIn):
    id: uuid.UUID
    autoridade_usuario_id: uuid.UUID
