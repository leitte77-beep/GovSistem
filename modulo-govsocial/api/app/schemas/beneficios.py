import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


# ── Estoque ───────────────────────────────────────────────────────────
class EstoqueCreate(BaseModel):
    unit_id: uuid.UUID
    benefit_type_code: str = Field(..., max_length=40)
    quantidade_inicial: Decimal = Field(..., ge=0, max_digits=12, decimal_places=2)
    quantidade_minima: Decimal = Field(Decimal("0"), ge=0, max_digits=12, decimal_places=2)
    unidade_medida: str = "UNIDADE"
    valor_unitario_referencia: Optional[Decimal] = None


class EstoqueUpdate(BaseModel):
    quantidade_atual: Optional[Decimal] = None
    quantidade_minima: Optional[Decimal] = None
    valor_unitario_referencia: Optional[Decimal] = None


class EstoqueOut(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    benefit_type_code: str
    quantidade_atual: Decimal
    quantidade_minima: Decimal
    unidade_medida: str
    valor_unitario_referencia: Optional[Decimal]
    created_at: datetime
    updated_at: datetime


class EstoqueMovement(BaseModel):
    """Entrada ou saída manual de estoque (ajuste)."""
    quantidade: Decimal = Field(..., max_digits=12, decimal_places=2)
    observacao: Optional[str] = None


# ── Concessão de Benefício ────────────────────────────────────────────
class ConcessaoCreate(BaseModel):
    family_id: uuid.UUID
    person_id: Optional[uuid.UUID] = None
    unit_id: uuid.UUID
    benefit_type_code: str = Field(..., max_length=40)
    quantidade: Decimal = Field(Decimal("1"), ge=0, max_digits=12, decimal_places=2)
    valor_total: Optional[Decimal] = None
    solicitado_por_id: Optional[uuid.UUID] = None


class ConcessaoUpdate(BaseModel):
    """Atualização de campos antes da análise/aprovação."""
    quantidade: Optional[Decimal] = None
    valor_total: Optional[Decimal] = None
    person_id: Optional[uuid.UUID] = None


class ParecerCreate(BaseModel):
    """Emissão de parecer técnico."""
    parecer: Optional[str] = None


class AprovacaoCreate(BaseModel):
    """Aprovação da concessão."""


class NegacaoCreate(BaseModel):
    """Negação da concessão."""
    motivo_negacao: str


class EntregaCreate(BaseModel):
    """Registro de entrega com assinatura."""


class ConcessaoOut(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    person_id: Optional[uuid.UUID]
    unit_id: uuid.UUID
    benefit_type_code: str
    quantidade: Decimal
    valor_total: Optional[Decimal]
    status: str
    data_solicitacao: datetime
    data_analise: Optional[datetime]
    data_aprovacao: Optional[datetime]
    data_entrega: Optional[datetime]
    solicitado_por_id: Optional[uuid.UUID]
    analisado_por_id: Optional[uuid.UUID]
    aprovado_por_id: Optional[uuid.UUID]
    parecer: Optional[str] = None
    parecer_restrito: bool = False
    motivo_negacao: Optional[str]
    comprovante_gerado: bool
    assinatura_data: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class ConcessaoListItem(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    unit_id: uuid.UUID
    benefit_type_code: str
    status: str
    data_solicitacao: datetime
    valor_total: Optional[Decimal]
