import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


# ── ESFERA ─────────────────────────────────────────────────────────────
ESFERA_OPCOES = ["FEDERAL", "ESTADUAL", "MUNICIPAL"]
STATUS_OPCOES = ["ATIVO", "ENCERRADO", "CANCELADO"]
CATEGORIA_OPCOES = ["BENEFICIO", "PESSOAL", "MATERIAL", "SERVICO", "OUTROS"]


# ── Repasse ────────────────────────────────────────────────────────────
class RepasseCreate(BaseModel):
    esfera: str = Field(..., max_length=20)
    programa: str = Field(..., max_length=255)
    valor_total: Decimal = Field(..., ge=0, max_digits=14, decimal_places=2)
    data_repasse: date
    data_vigencia_inicio: date
    data_vigencia_fim: Optional[date] = None
    observacoes: Optional[str] = None


class RepasseUpdate(BaseModel):
    programa: Optional[str] = Field(None, max_length=255)
    valor_total: Optional[Decimal] = Field(None, ge=0, max_digits=14, decimal_places=2)
    data_repasse: Optional[date] = None
    data_vigencia_inicio: Optional[date] = None
    data_vigencia_fim: Optional[date] = None
    observacoes: Optional[str] = None


class RepasseOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    esfera: str
    programa: str
    valor_total: Decimal
    valor_utilizado: Decimal
    data_repasse: date
    data_vigencia_inicio: date
    data_vigencia_fim: Optional[date]
    status: str
    observacoes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RepasseListItem(BaseModel):
    id: uuid.UUID
    esfera: str
    programa: str
    valor_total: Decimal
    valor_utilizado: Decimal
    status: str
    data_repasse: date
    data_vigencia_fim: Optional[date]

    model_config = {"from_attributes": True}


# ── Gasto ──────────────────────────────────────────────────────────────
class GastoCreate(BaseModel):
    categoria: str = Field(..., max_length=20)
    descricao: str = Field(..., max_length=500)
    valor: Decimal = Field(..., gt=0, max_digits=14, decimal_places=2)
    data_gasto: date
    comprovante_url: Optional[str] = None


class GastoUpdate(BaseModel):
    categoria: Optional[str] = Field(None, max_length=20)
    descricao: Optional[str] = Field(None, max_length=500)
    valor: Optional[Decimal] = Field(None, gt=0, max_digits=14, decimal_places=2)
    data_gasto: Optional[date] = None
    comprovante_url: Optional[str] = None


class GastoOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    repasse_id: uuid.UUID
    categoria: str
    descricao: str
    valor: Decimal
    data_gasto: date
    comprovante_url: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Dashboard ──────────────────────────────────────────────────────────
class ResumoEsfera(BaseModel):
    esfera: str
    total_repasse: Decimal
    total_utilizado: Decimal
    saldo: Decimal
    percentual_utilizado: Decimal


class DashboardFinanceiro(BaseModel):
    total_repasse: Decimal
    total_gasto: Decimal
    saldo_disponivel: Decimal
    percentual_utilizado_geral: Decimal
    por_esfera: list[ResumoEsfera]


# ── Prestação de Contas ────────────────────────────────────────────────
class PrestacaoContasItem(BaseModel):
    repasse_id: uuid.UUID
    esfera: str
    programa: str
    valor_total: Decimal
    valor_utilizado: Decimal
    saldo: Decimal
    total_gastos: int
    gastos: list[GastoOut]


class PrestacaoContasOut(BaseModel):
    ano: int
    total_repasse: Decimal
    total_gasto: Decimal
    saldo_geral: Decimal
    itens: list[PrestacaoContasItem]
