"""Contratos da Fase 7: odontologia (B.3-001…027)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Aplicavel = Literal["DENTE", "FACE", "SEXTANTE", "ARCADA", "BOCA"]
Face = Literal["M", "D", "O", "I", "V", "L", "P"]


class CondicaoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codigo: str = Field(min_length=1, max_length=40)
    nome: str = Field(min_length=2, max_length=160)
    tipo: Literal["CONDICAO", "PROCEDIMENTO"]
    cor: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    aplicavel_a: list[Aplicavel] = Field(min_length=1)
    denticao: Literal["PERMANENTE", "DECIDUA", "AMBAS"] = "AMBAS"
    procedimento_sigtap: str | None = Field(default=None, max_length=10)
    vigencia_inicio: date | None = None


class CondicaoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nome: str | None = Field(default=None, min_length=2, max_length=160)
    cor: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    aplicavel_a: list[Aplicavel] | None = Field(default=None, min_length=1)
    denticao: Literal["PERMANENTE", "DECIDUA", "AMBAS"] | None = None
    procedimento_sigtap: str | None = Field(default=None, max_length=10)
    vigencia_fim: date | None = None


class CondicaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    codigo: str
    nome: str
    tipo: str
    cor: str | None
    aplicavel_a: list[str]
    denticao: str
    procedimento_sigtap: str | None
    vigencia_inicio: date
    vigencia_fim: date | None
    versao: int


class Marcacao(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dente: int | None = Field(default=None, description="Notação FDI (ISO 3950).")
    faces: list[Face] = Field(default_factory=list)
    regiao: (
        Literal[
            "SEXTANTE_1",
            "SEXTANTE_2",
            "SEXTANTE_3",
            "SEXTANTE_4",
            "SEXTANTE_5",
            "SEXTANTE_6",
            "ARCADA_SUPERIOR",
            "ARCADA_INFERIOR",
            "BOCA",
        ]
        | None
    ) = None
    condicao_id: uuid.UUID
    situacao: Literal["EXISTENTE", "PLANEJADO", "REALIZADO"] = "EXISTENTE"
    observacao: str | None = Field(default=None, max_length=1000)


class OdontogramaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    versao_base: int = Field(
        ge=0, description="Versão sobre a qual a nova foi montada; 0 = primeira."
    )
    atendimento_id: uuid.UUID | None = None
    marcacoes: list[Marcacao]
    justificativa: str | None = Field(default=None, max_length=2000)


class OdontogramaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    cidadao_id: uuid.UUID
    numero_versao: int
    atendimento_id: uuid.UUID | None
    marcacoes: list[dict[str, Any]]
    justificativa: str | None
    criado_por_id: uuid.UUID | None
    created_at: datetime


class OdontogramaAtualOut(BaseModel):
    cidadao_id: uuid.UUID
    versao: OdontogramaOut | None
    planejados: list[ProcedimentoOut]


class AtendimentoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cidadao_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    profissional_id: uuid.UUID | None = None
    agendamento_id: uuid.UUID | None = None
    tipo: str = Field(min_length=2, max_length=40)
    iniciado_em: datetime | None = None
    formulario_anamnese_codigo: str | None = Field(default=None, max_length=80)
    anamnese: dict[str, Any] | None = None
    triagem: dict[str, Any] | None = None
    classificacao_risco: str | None = Field(default=None, max_length=40)
    evolucao: str | None = Field(default=None, max_length=20000)
    retroativo_justificativa: str | None = Field(default=None, max_length=2000)


class AtendimentoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    anamnese: dict[str, Any] | None = None
    triagem: dict[str, Any] | None = None
    classificacao_risco: str | None = Field(default=None, max_length=40)
    evolucao: str | None = Field(default=None, max_length=20000)


class AtendimentoCancelar(BaseModel):
    model_config = ConfigDict(extra="forbid")
    motivo: str = Field(min_length=3, max_length=2000)


class AtendimentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    cidadao_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    profissional_id: uuid.UUID | None
    agendamento_id: uuid.UUID | None
    tipo: str
    situacao: str
    iniciado_em: datetime
    finalizado_em: datetime | None
    formulario_anamnese_id: uuid.UUID | None
    versao_formulario: int | None
    anamnese: dict[str, Any] | None
    triagem: dict[str, Any] | None
    classificacao_risco: str | None
    evolucao: str | None
    retroativo: bool
    retroativo_justificativa: str | None
    cancelamento_motivo: str | None
    versao: int


class Insumo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    descricao: str = Field(min_length=1, max_length=200)
    quantidade: float = Field(gt=0)
    unidade: str | None = Field(default=None, max_length=20)
    produto_id: uuid.UUID | None = None


class ProcedimentoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cidadao_id: uuid.UUID
    atendimento_id: uuid.UUID | None = None
    condicao_id: uuid.UUID | None = None
    procedimento_sigtap: str | None = Field(default=None, max_length=10)
    dente: int | None = None
    faces: list[Face] = Field(default_factory=list)
    regiao: str | None = Field(default=None, max_length=20)
    quantidade: int = Field(default=1, ge=1, le=99)
    programado_para: date | None = None
    realizar_agora: bool = False
    insumos: list[Insumo] = Field(default_factory=list)


class ProcedimentoRealizar(BaseModel):
    model_config = ConfigDict(extra="forbid")
    atendimento_id: uuid.UUID
    realizado_em: date | None = None
    insumos: list[Insumo] | None = None


class ProcedimentoCancelar(BaseModel):
    model_config = ConfigDict(extra="forbid")
    motivo: str = Field(min_length=3, max_length=2000)


class ProcedimentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    cidadao_id: uuid.UUID
    atendimento_id: uuid.UUID | None
    condicao_id: uuid.UUID | None
    procedimento_sigtap: str | None
    dente: int | None
    faces: list[str]
    regiao: str | None
    situacao: str
    quantidade: int
    programado_para: date | None
    realizado_em: date | None
    insumos: list[dict[str, Any]]
    cancelamento_motivo: str | None
    versao: int


class DocumentoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tipo: Literal["ATESTADO", "DECLARACAO", "RECEITA", "ORIENTACAO", "ENCAMINHAMENTO", "OUTRO"]
    titulo: str = Field(min_length=2, max_length=200)
    conteudo: str = Field(min_length=1, max_length=20000)


class DocumentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    atendimento_id: uuid.UUID
    tipo: str
    titulo: str
    conteudo: str
    emitido_em: datetime
    baixa_em: datetime | None = None


class RelatorioLinhaOut(BaseModel):
    chave: str
    procedimentos: int
    quantidade: int


class RelatorioOut(BaseModel):
    inicio: date
    fim: date
    agrupar_por: str
    linhas: list[RelatorioLinhaOut]


class ExportacaoLediOut(BaseModel):
    atendimento_id: uuid.UUID
    sistema: str
    situacao: str
    pendencias: list[dict[str, Any]]


OdontogramaAtualOut.model_rebuild()
