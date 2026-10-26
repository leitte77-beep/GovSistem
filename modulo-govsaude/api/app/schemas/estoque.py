"""Contratos da Fase 8 — estoque e assistência farmacêutica (B.4-001…043)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

TipoProduto = Literal["MEDICAMENTO", "VACINA", "INSUMO", "MATERIAL"]
TipoManual = Literal[
    "ENTRADA",
    "DEVOLUCAO",
    "SAIDA",
    "PERDA",
    "DOACAO",
    "CONSUMO_INTERNO",
    "AJUSTE_POSITIVO",
    "AJUSTE_NEGATIVO",
    "QUEBRA",
    "VENCIMENTO",
]


class ProdutoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codigo: str = Field(min_length=1, max_length=40)
    nome: str = Field(min_length=2, max_length=300)
    tipo: TipoProduto
    unidade: str = Field(min_length=1, max_length=20)
    principio_ativo: str | None = Field(default=None, max_length=300)
    apresentacao: str | None = Field(default=None, max_length=200)
    catmat: str | None = Field(default=None, pattern=r"^\d{1,20}$")
    codigo_obm: str | None = Field(default=None, max_length=30)
    remume: bool = False
    controlado: bool = False
    lista_controle: str | None = Field(default=None, max_length=20)
    antimicrobiano: bool = False


class ProdutoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nome: str | None = Field(default=None, min_length=2, max_length=300)
    apresentacao: str | None = Field(default=None, max_length=200)
    remume: bool | None = None
    controlado: bool | None = None
    lista_controle: str | None = Field(default=None, max_length=20)
    antimicrobiano: bool | None = None


class ProdutoOut(ProdutoCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    versao: int
    baixa_em: datetime | None


class LocalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    estabelecimento_id: uuid.UUID
    nome: str = Field(min_length=2, max_length=200)
    tipo: str = Field(min_length=2, max_length=30)
    temperatura_min: float | None = None
    temperatura_max: float | None = None

    @model_validator(mode="after")
    def _faixa(self):
        if (
            self.temperatura_min is not None
            and self.temperatura_max is not None
            and self.temperatura_min >= self.temperatura_max
        ):
            raise ValueError("temperatura_min deve ser menor que temperatura_max")
        return self


class LocalOut(LocalCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    versao: int


class ParametroSet(BaseModel):
    model_config = ConfigDict(extra="forbid")
    produto_id: uuid.UUID
    minimo: float | None = Field(default=None, ge=0)
    maximo: float | None = Field(default=None, ge=0)
    ideal: float | None = Field(default=None, ge=0)
    ponto_pedido: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _ordem(self):
        if self.minimo is not None and self.maximo is not None and self.minimo > self.maximo:
            raise ValueError("minimo não pode ser maior que maximo")
        return self


class ParametroOut(ParametroSet):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    local_id: uuid.UUID
    versao: int


class LoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    produto_id: uuid.UUID
    numero: str
    validade: date
    fabricante: str | None
    bloqueado: bool
    bloqueio_motivo: str | None
    versao: int


class LoteBloqueio(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bloqueado: bool
    motivo: str = Field(min_length=5, max_length=2000)


class MovimentacaoCreate(BaseModel):
    """Entrada/devolução informam o lote (criado se não existir); saída usa FEFO se omitido."""

    model_config = ConfigDict(extra="forbid")
    local_id: uuid.UUID
    produto_id: uuid.UUID
    tipo: TipoManual
    quantidade: float = Field(gt=0)
    lote_id: uuid.UUID | None = None
    lote_numero: str | None = Field(default=None, max_length=60)
    validade: date | None = None
    fabricante: str | None = Field(default=None, max_length=200)
    custo_unitario: float | None = Field(default=None, ge=0)
    ocorrido_em: datetime | None = None
    documento: dict | None = Field(
        default=None,
        description="Ex.: tipo (NF, PEDIDO, EMPENHO, CONTRATO), numero, fornecedor (B.4-009).",
    )
    motivo: str | None = Field(default=None, max_length=2000)
    centro_custo: str | None = Field(default=None, max_length=40)


class MovimentacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    local_id: uuid.UUID
    produto_id: uuid.UUID
    lote_id: uuid.UUID
    tipo: str
    quantidade: float
    custo_unitario: float | None
    ocorrido_em: datetime
    competencia: str
    documento: dict | None
    motivo: str | None
    referencia_tipo: str | None
    referencia_id: uuid.UUID | None
    centro_custo: str | None = None


class ItemRequisicao(BaseModel):
    model_config = ConfigDict(extra="forbid")
    produto_id: uuid.UUID
    quantidade: float = Field(gt=0)


class RequisicaoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    origem_local_id: uuid.UUID
    destino_local_id: uuid.UUID
    itens: list[ItemRequisicao] = Field(min_length=1, max_length=200)
    observacao: str | None = Field(default=None, max_length=2000)


class ItemAtendimento(BaseModel):
    model_config = ConfigDict(extra="forbid")
    produto_id: uuid.UUID
    quantidade: float = Field(ge=0)


class RequisicaoAtender(BaseModel):
    model_config = ConfigDict(extra="forbid")
    itens: list[ItemAtendimento] = Field(min_length=1)


class Motivo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    motivo: str = Field(min_length=5, max_length=2000)


class RequisicaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    numero: str
    origem_local_id: uuid.UUID
    destino_local_id: uuid.UUID
    situacao: str
    itens: list[dict]
    observacao: str | None
    motivo_recusa: str | None
    atendida_em: datetime | None
    concluida_em: datetime | None
    versao: int


class InventarioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    local_id: uuid.UUID


class Contagem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lote_id: uuid.UUID
    quantidade: float = Field(ge=0)


class ContagensSet(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contagens: list[Contagem] = Field(min_length=1)


class InventarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    local_id: uuid.UUID
    situacao: str
    contagens: list[dict]
    divergencias: list[dict] | None
    encerrado_em: datetime | None
    versao: int


class CompetenciaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    competencia: str
    encerrada_em: datetime | None
    reaberta_motivo: str | None


class ItemDispensacao(BaseModel):
    model_config = ConfigDict(extra="forbid")
    produto_id: uuid.UUID
    quantidade: float = Field(gt=0)
    quantidade_prescrita: float | None = Field(default=None, gt=0)
    lote_id: uuid.UUID | None = None


class DispensacaoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cidadao_id: uuid.UUID
    local_id: uuid.UUID
    prescricao_id: uuid.UUID | None = None
    itens: list[ItemDispensacao] = Field(min_length=1, max_length=50)
    documento: dict | None = None
    justificativa: str | None = Field(default=None, max_length=2000)


class DispensacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    cidadao_id: uuid.UUID
    local_id: uuid.UUID
    prescricao_id: uuid.UUID | None
    situacao: str
    itens: list[dict]
    documento: dict | None
    alertas: dict | None
    estornada_em: datetime | None
    estorno_motivo: str | None
    created_at: datetime


class TemperaturaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    temperatura: float = Field(ge=-100, le=100)
    medido_em: datetime | None = None
    origem: Literal["MANUAL", "EQUIPAMENTO"] = "MANUAL"
    observacao: str | None = Field(default=None, max_length=2000)


class TemperaturaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    local_id: uuid.UUID
    temperatura: float
    medido_em: datetime
    fora_da_faixa: bool
    origem: str
