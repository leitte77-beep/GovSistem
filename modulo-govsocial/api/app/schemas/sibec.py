import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class SibecDataOut(BaseModel):
    id: uuid.UUID
    family_id: Optional[uuid.UUID]
    person_id: Optional[uuid.UUID]
    nis: str
    nome_beneficiario: Optional[str]
    tipo_beneficio: str
    valor: Optional[float]
    data_concessao: Optional[date]
    data_referencia: date
    situacao: Optional[str]
    data_bloqueio: Optional[date]
    motivo_bloqueio: Optional[str]
    data_desbloqueio: Optional[date]
    observacoes: Optional[str]
    created_at: datetime


class SibecFamilySummary(BaseModel):
    """Resumo dos beneficios Sibec para uma familia."""
    family_id: uuid.UUID
    nis_responsavel: str
    valor_total: float
    beneficios_ativos: int
    beneficios_bloqueados: int
    data_ultima_atualizacao: date
    registros: list[SibecDataOut]
