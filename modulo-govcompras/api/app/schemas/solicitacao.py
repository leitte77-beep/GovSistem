import uuid

from pydantic import Field

from app.schemas.comuns import Base


class SolicitacaoItemIn(Base):
    catalogo_item_id: uuid.UUID | None = None
    codigo: str | None = None
    descricao: str = Field(..., min_length=2)
    unidade: str = Field(..., min_length=1, max_length=20)
    quantidade: float = Field(..., gt=0)
    especificacao: str | None = None
    valor_unitario_estimado: float | None = None
    observacoes: str | None = None


class SolicitacaoItemOut(SolicitacaoItemIn):
    id: uuid.UUID


class SolicitacaoIn(Base):
    secretaria_id: uuid.UUID
    setor_id: uuid.UUID | None = None
    tipo_objeto: str = "bem"
    objeto: str = Field(..., min_length=5)
    descricao: str | None = None
    justificativa: str = Field(..., min_length=5)
    prioridade: str = "normal"
    data_desejada: str | None = None
    recurso: str | None = None
    convenio: str | None = None
    fonte: str | None = None
    dotacao_conhecida: str | None = None
    observacoes: str | None = None
    itens: list[SolicitacaoItemIn] = []


class SolicitacaoOut(Base):
    id: uuid.UUID
    numero: str
    exercicio: int
    secretaria_id: uuid.UUID
    setor_id: uuid.UUID | None = None
    solicitante_usuario_id: uuid.UUID
    tipo_objeto: str
    objeto: str
    descricao: str | None = None
    justificativa: str
    prioridade: str
    valor_estimado_total: float | None = None
    status: str
    itens: list[SolicitacaoItemOut] = []


class EnviarSolicitacaoIn(Base):
    tipo_processo: str
