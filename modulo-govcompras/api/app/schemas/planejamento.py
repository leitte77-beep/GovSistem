import uuid

from pydantic import Field

from app.schemas.comuns import Base


class DfdIn(Base):
    descricao_necessidade: str = Field(..., min_length=5)
    quantidade_estimada: str | None = None


class DfdOut(DfdIn):
    id: uuid.UUID
    processo_id: uuid.UUID
    status: str


class EtpTopicoIn(Base):
    titulo: str
    conteudo: str | None = None


class EtpTopicoOut(Base):
    id: uuid.UUID
    ordem: int
    titulo: str
    conteudo: str | None = None
    status: str
    sugerido_por_ia: bool = False


class EtpOut(Base):
    id: uuid.UUID
    processo_id: uuid.UUID
    status: str
    topicos: list[EtpTopicoOut] = []


class TermoReferenciaIn(Base):
    objeto: str | None = None
    justificativa: str | None = None
    especificacoes: str | None = None
    local_entrega: str | None = None
    prazo_execucao: str | None = None
    obrigacoes_contratada: str | None = None
    obrigacoes_administracao: str | None = None
    criterio_julgamento: str | None = None
    criterios_aceitacao: str | None = None
    sancoes: str | None = None
    valor_estimado: float | None = None


class TermoReferenciaOut(TermoReferenciaIn):
    id: uuid.UUID
    processo_id: uuid.UUID
    versao: int
    status: str


class MatrizRiscoItemIn(Base):
    categoria: str | None = None
    descricao_risco: str = Field(..., min_length=3)
    probabilidade: str
    impacto: str
    responsavel_mitigacao: str | None = None
    acao_preventiva: str | None = None
    acao_contingencia: str | None = None


class MatrizRiscoItemOut(MatrizRiscoItemIn):
    id: uuid.UUID
    nivel: str


class MatrizRiscoOut(Base):
    id: uuid.UUID
    processo_id: uuid.UUID
    itens: list[MatrizRiscoItemOut] = []
