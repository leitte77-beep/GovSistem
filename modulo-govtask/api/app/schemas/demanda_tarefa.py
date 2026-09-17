"""Schemas das tarefas da demanda (§11, §20, §158)."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import Prioridade, StatusTarefa, TipoTarefa
from app.schemas.demanda import PessoaOut, SetorOut


class TarefaCriar(BaseModel):
    titulo: str = Field(min_length=3, max_length=500)
    descricao: Optional[str] = None
    tipo: TipoTarefa = TipoTarefa.EXECUCAO
    atribuida_a_id: Optional[uuid.UUID] = None
    setor_destino_id: Optional[uuid.UUID] = None
    etapa_id: Optional[uuid.UUID] = None
    tarefa_pai_id: Optional[uuid.UUID] = None
    prioridade: Optional[Prioridade] = None
    prazo: Optional[datetime] = None
    prazo_interno: Optional[datetime] = None
    exige_retorno: bool = True
    exige_documento: bool = False
    exige_comentario: bool = False
    exige_aprovacao: bool = False
    permite_reencaminhar: bool = True
    exige_aceite: bool = Field(
        default=True,
        description="Destinatário precisa clicar em 'receber' antes de trabalhar (§21)",
    )
    recorrente: bool = False
    intervalo_recorrencia_dias: Optional[int] = Field(default=None, ge=1)


class TarefaAtualizar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    titulo: Optional[str] = Field(default=None, min_length=3, max_length=500)
    descricao: Optional[str] = None
    prioridade: Optional[Prioridade] = None
    prazo: Optional[datetime] = None
    prazo_interno: Optional[datetime] = None
    motivo_prazo: Optional[str] = Field(
        default=None, description="Justificativa exigida ao mexer no prazo"
    )
    exige_documento: Optional[bool] = None
    exige_comentario: Optional[bool] = None
    exige_aprovacao: Optional[bool] = None
    permite_reencaminhar: Optional[bool] = None


class MovimentacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tipo: str
    motivo: Optional[str] = None
    prazo: Optional[datetime] = None
    para_user: Optional[PessoaOut] = None
    para_setor: Optional[SetorOut] = None
    recebido_em: Optional[datetime] = None
    encerrado_em: Optional[datetime] = None
    created_at: datetime


class TarefaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    demanda_id: Optional[uuid.UUID] = None
    tarefa_pai_id: Optional[uuid.UUID] = None
    titulo: str
    descricao: Optional[str] = None
    tipo: TipoTarefa
    status: StatusTarefa
    prioridade: Prioridade
    prazo: Optional[datetime] = None
    prazo_interno: Optional[datetime] = None
    atribuida_a: Optional[PessoaOut] = None
    setor_destino: Optional[SetorOut] = None
    solicitante: Optional[PessoaOut] = None
    exige_retorno: bool
    exige_documento: bool
    exige_comentario: bool
    exige_aprovacao: bool
    permite_reencaminhar: bool
    motivo_devolucao: Optional[str] = None
    motivo_espera: Optional[str] = None
    motivo_bloqueio: Optional[str] = None
    resultado: Optional[str] = None
    data_aceite: Optional[datetime] = None
    data_entrega: Optional[datetime] = None
    data_conclusao: Optional[datetime] = None
    created_at: datetime

    # Derivados
    atrasada: bool = False
    em_espera: bool = False
    bloqueada_por: list[str] = Field(default_factory=list)
    qtd_anexos: int = 0
    qtd_comentarios: int = 0
    qtd_subtarefas_abertas: int = 0


class TarefaDetalhe(TarefaOut):
    movimentacoes: list[MovimentacaoOut] = Field(default_factory=list)
    subtarefas: list[TarefaOut] = Field(default_factory=list)


class EncaminharRequest(BaseModel):
    """Encaminhamento (§20). Não transfere a responsabilidade pela demanda."""

    para_user_id: Optional[uuid.UUID] = None
    para_setor_id: Optional[uuid.UUID] = None
    motivo: Optional[str] = None
    prazo: Optional[datetime] = None
    exige_retorno: bool = True


class DevolverRequest(BaseModel):
    motivo: str = Field(min_length=5, description="Justificativa obrigatória (§22)")


class EsperaRequest(BaseModel):
    status: StatusTarefa
    motivo: str = Field(min_length=3)


class ConcluirTarefaRequest(BaseModel):
    resultado: Optional[str] = Field(
        default=None, description="O que foi feito; vira registro na timeline"
    )


class SolicitarInformacaoRequest(BaseModel):
    """Pede algo a outro setor sem perder a responsabilidade (§23)."""

    titulo: str = Field(min_length=3, max_length=500)
    descricao: Optional[str] = None
    atribuida_a_id: Optional[uuid.UUID] = None
    setor_destino_id: Optional[uuid.UUID] = None
    prazo: Optional[datetime] = None


class MinhasTarefasOut(BaseModel):
    """Recorte pessoal do trabalho (§11)."""

    hoje: list[TarefaOut]
    atrasadas: list[TarefaOut]
    proximas: list[TarefaOut]
    aguardando: list[TarefaOut]
    devolvidas: list[TarefaOut]
    em_execucao: list[TarefaOut]
    a_receber: list[TarefaOut]
    total: int
