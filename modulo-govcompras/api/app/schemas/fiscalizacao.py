import uuid
from datetime import date

from pydantic import Field

from app.schemas.comuns import Base


class OcorrenciaIn(Base):
    descricao: str = Field(..., min_length=3)
    classificacao: str = "informativa"


class OcorrenciaOut(OcorrenciaIn):
    id: uuid.UUID
    status: str


class MedicaoIn(Base):
    numero: str
    competencia: str
    periodo_inicio: date | None = None
    periodo_fim: date | None = None
    valor: float = Field(..., gt=0)
    percentual: float | None = None


class MedicaoOut(MedicaoIn):
    id: uuid.UUID
    status: str


class NotaFiscalIn(Base):
    medicao_id: uuid.UUID | None = None
    numero: str
    serie: str | None = None
    data: date
    valor: float = Field(..., gt=0)
    competencia: str | None = None


class NotaFiscalOut(NotaFiscalIn):
    id: uuid.UUID
    status: str
