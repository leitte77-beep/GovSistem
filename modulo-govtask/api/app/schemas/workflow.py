"""Schemas do motor de workflow (§17, §18)."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    ModoEtapa,
    NaturezaEtapa,
    RegraConclusaoEtapa,
    StatusEtapa,
    StatusWorkflowVersao,
    TipoContagemPrazo,
    TipoTarefa,
)
from app.schemas.demanda import SetorOut


class TarefaModeloEntrada(BaseModel):
    titulo: str = Field(min_length=3, max_length=500)
    descricao: Optional[str] = None
    ordem: int = 1
    tipo: TipoTarefa = TipoTarefa.EXECUCAO
    setor_destino_id: Optional[uuid.UUID] = None
    prazo_dias: Optional[int] = Field(default=None, ge=0)
    exige_documento: bool = False
    exige_comentario: bool = False
    exige_aprovacao: bool = False
    exige_aceite: bool = True


class TarefaModeloOut(TarefaModeloEntrada):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


class EtapaModeloEntrada(BaseModel):
    chave: str = Field(min_length=2, max_length=60)
    nome: str = Field(min_length=2, max_length=255)
    descricao: Optional[str] = None
    ordem: int = Field(ge=1)
    peso: int = Field(default=0, ge=0, le=100)
    modo: ModoEtapa = ModoEtapa.SEQUENCIAL
    natureza: NaturezaEtapa = NaturezaEtapa.INTERNA
    regra_conclusao: RegraConclusaoEtapa = RegraConclusaoEtapa.TODAS_TAREFAS
    setor_responsavel_id: Optional[uuid.UUID] = None
    responsavel_id: Optional[uuid.UUID] = None
    prazo_dias: Optional[int] = Field(default=None, ge=0)
    tipo_contagem: TipoContagemPrazo = TipoContagemPrazo.DIAS_UTEIS
    exige_aprovacao: bool = False
    documentos_obrigatorios: Optional[list[str]] = None
    condicao: Optional[dict] = Field(
        default=None,
        description='Ex.: {"campo": "valor_aprovado", "operador": "maior_que", "valor": 0}',
    )
    status_demanda_id: Optional[uuid.UUID] = None
    is_final: bool = False
    tarefas: list[TarefaModeloEntrada] = Field(default_factory=list)


class EtapaModeloOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    chave: str
    nome: str
    descricao: Optional[str] = None
    ordem: int
    peso: int
    modo: ModoEtapa
    natureza: NaturezaEtapa
    regra_conclusao: RegraConclusaoEtapa
    setor_responsavel: Optional[SetorOut] = None
    prazo_dias: Optional[int] = None
    tipo_contagem: TipoContagemPrazo
    exige_aprovacao: bool
    documentos_obrigatorios: Optional[list[str]] = None
    condicao: Optional[dict] = None
    is_final: bool
    tarefas_modelo: list[TarefaModeloOut] = Field(default_factory=list)


class VersaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    versao: int
    status: StatusWorkflowVersao
    notas: Optional[str] = None
    publicada_em: Optional[datetime] = None
    etapas: list[EtapaModeloOut] = Field(default_factory=list)


class WorkflowCriar(BaseModel):
    chave: str = Field(min_length=2, max_length=60)
    nome: str = Field(min_length=2, max_length=255)
    descricao: Optional[str] = None
    tipo_demanda_id: Optional[uuid.UUID] = None
    copiar_de_id: Optional[uuid.UUID] = Field(
        default=None,
        description="Workflow existente a clonar como ponto de partida",
    )


class WorkflowAtualizar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: Optional[str] = Field(default=None, min_length=2, max_length=255)
    descricao: Optional[str] = None
    tipo_demanda_id: Optional[uuid.UUID] = None
    ativo: Optional[bool] = None


class WorkflowListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    chave: str
    nome: str
    descricao: Optional[str] = None
    ativo: bool
    is_system: bool
    organization_id: Optional[uuid.UUID] = None
    versao_atual: Optional[int] = None
    qtd_etapas: int = 0


class WorkflowDetalhe(WorkflowListItem):
    versoes: list[VersaoOut] = Field(default_factory=list)


class PublicarVersaoRequest(BaseModel):
    notas: Optional[str] = None


class AplicarFluxoRequest(BaseModel):
    workflow_id: uuid.UUID


class EtapaInstanciaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str
    descricao: Optional[str] = None
    ordem: int
    peso: int
    modo: ModoEtapa
    natureza: NaturezaEtapa
    status: StatusEtapa
    regra_conclusao: RegraConclusaoEtapa
    prazo: Optional[datetime] = None
    data_inicio: Optional[datetime] = None
    data_conclusao: Optional[datetime] = None
    documentos_obrigatorios: Optional[list[str]] = None

    # Derivados
    qtd_tarefas: int = 0
    qtd_tarefas_concluidas: int = 0
    documentos_faltantes: list[str] = Field(default_factory=list)


class EtapaAvulsaRequest(BaseModel):
    nome: str = Field(min_length=3, max_length=255)
    descricao: Optional[str] = None
    setor_responsavel_id: Optional[uuid.UUID] = None
    prazo: Optional[datetime] = None
    peso: int = Field(default=0, ge=0, le=100)


class ConcluirEtapaRequest(BaseModel):
    justificativa: Optional[str] = None
