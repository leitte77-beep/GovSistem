import uuid
from datetime import date

from pydantic import Field

from app.schemas.comuns import Base


class GerarContratoIn(Base):
    fornecedor_id: uuid.UUID | None = None
    numero: str | None = None
    objeto: str | None = None
    valor_global: float | None = None
    data_assinatura: date | None = None
    vigencia_inicio: date
    vigencia_fim: date
    gestor_usuario_id: uuid.UUID | None = None
    fiscal_usuario_id: uuid.UUID | None = None
    garantia: str | None = None
    reajuste: str | None = None
    indice: str | None = None
    condicoes_pagamento: str | None = None


class ContratoOut(Base):
    id: uuid.UUID
    numero: str
    exercicio: int
    processo_id: uuid.UUID
    fornecedor_id: uuid.UUID
    fornecedor_nome: str | None = None
    secretaria_id: uuid.UUID
    objeto: str
    valor_global: float
    vigencia_inicio: date
    vigencia_fim: date
    gestor_usuario_id: uuid.UUID | None = None
    gestor_nome: str | None = None
    fiscal_usuario_id: uuid.UUID | None = None
    fiscal_nome: str | None = None
    status: str
    dias_para_vencer: int
    percentual_vigencia_transcorrida: float


class AditivoIn(Base):
    numero: str
    tipo: str
    justificativa: str = Field(..., min_length=5)
    valor_acrescimo: float | None = None
    nova_vigencia_fim: date | None = None
    data: date


class AditivoOut(AditivoIn):
    id: uuid.UUID


class ApostilamentoIn(Base):
    descricao: str = Field(..., min_length=5)
    data: date


class ApostilamentoOut(ApostilamentoIn):
    id: uuid.UUID


class ContratoSaldoOut(Base):
    valor_global: float
    valor_empenhado: float
    valor_liquidado: float
    valor_pago: float
    saldo_disponivel: float


class ContratoItemSaldoIn(Base):
    catalogo_item_id: uuid.UUID | None = None
    descricao: str
    quantidade_contratada: float = Field(..., gt=0)


class ContratoItemSaldoOut(ContratoItemSaldoIn):
    id: uuid.UUID
    quantidade_utilizada: float
    percentual_utilizado: float
    saldo: float


class DecisaoVencimentoIn(Base):
    decisao: str = Field(..., description="nova_contratacao | prorrogacao | encerramento | analisar_depois")
