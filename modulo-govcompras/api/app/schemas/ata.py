import uuid
from datetime import date

from pydantic import Field

from app.schemas.comuns import Base


class AtaIn(Base):
    numero: str
    processo_id: uuid.UUID
    fornecedor_id: uuid.UUID
    objeto: str
    vigencia_inicio: date
    vigencia_fim: date


class AtaItemIn(Base):
    catalogo_item_id: uuid.UUID | None = None
    descricao: str
    valor_unitario_registrado: float = Field(..., gt=0)
    quantidade_registrada: float = Field(..., gt=0)


class AtaItemOut(AtaItemIn):
    id: uuid.UUID
    quantidade_reservada: float
    quantidade_utilizada: float
    quantidade_disponivel: float
    percentual_consumido: float


class AtaOut(AtaIn):
    id: uuid.UUID
    exercicio: int
    status: str
    dias_para_vencer: int
    itens: list[AtaItemOut] = []


class ConsumoAtaIn(Base):
    item_id: uuid.UUID
    solicitante_secretaria_id: uuid.UUID
    quantidade_solicitada: float = Field(..., gt=0)
    justificativa: str | None = None


class ConsumoAtaOut(ConsumoAtaIn):
    id: uuid.UUID
    status: str
