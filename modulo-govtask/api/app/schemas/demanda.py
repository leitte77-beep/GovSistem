"""Schemas da demanda (§5, §113).

O formulário é progressivo: quase nenhum campo é obrigatório além de título e
tipo. Os schemas de entrada listam explicitamente o que pode ser gravado, o que
fecha a porta para mass assignment (§102) — número, tenant, criador e datas de
controle nunca vêm do cliente.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    ConfidencialidadeDemanda,
    EsferaRecurso,
    OrigemDemanda,
    PrioridadeDemanda,
)


class CatalogoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    chave: str
    rotulo: str
    cor: Optional[str] = None


class PessoaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str


class SetorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str
    sigla: Optional[str] = None


class DemandaBase(BaseModel):
    titulo: str = Field(min_length=3, max_length=500)
    descricao: Optional[str] = None
    resumo_executivo: Optional[str] = None
    objeto: Optional[str] = None
    assunto: Optional[str] = Field(default=None, max_length=255)

    tipo_id: Optional[uuid.UUID] = None
    categoria_id: Optional[uuid.UUID] = None
    subcategoria_id: Optional[uuid.UUID] = None
    prioridade: PrioridadeDemanda = PrioridadeDemanda.NORMAL
    criticidade: Optional[str] = Field(default=None, max_length=20)
    impacto: Optional[str] = Field(default=None, max_length=20)
    confidencialidade: ConfidencialidadeDemanda = ConfidencialidadeDemanda.NORMAL

    origem: Optional[OrigemDemanda] = None
    origem_descricao: Optional[str] = None
    autoridade_id: Optional[uuid.UUID] = None

    solicitante_id: Optional[uuid.UUID] = None
    solicitante_externo: Optional[str] = Field(default=None, max_length=255)
    responsavel_geral_id: Optional[uuid.UUID] = None
    gestor_id: Optional[uuid.UUID] = None
    setor_solicitante_id: Optional[uuid.UUID] = None
    setor_atual_id: Optional[uuid.UUID] = None

    template_fluxo_id: Optional[uuid.UUID] = None
    fluxo_livre: bool = True

    proxima_acao: Optional[str] = None
    proxima_acao_responsavel_id: Optional[uuid.UUID] = None
    proxima_acao_prazo: Optional[datetime] = None

    data_solicitacao: Optional[date] = None
    prazo_final: Optional[datetime] = None
    prazo_legal: Optional[datetime] = None
    prazo_interno: Optional[datetime] = None
    previsao_conclusao: Optional[datetime] = None

    valor_previsto: Optional[Decimal] = None
    valor_aprovado: Optional[Decimal] = None
    valor_contratado: Optional[Decimal] = None
    valor_executado: Optional[Decimal] = None
    fonte_recurso: Optional[str] = Field(default=None, max_length=40)
    esfera: Optional[EsferaRecurso] = None
    orgao_concedente: Optional[str] = Field(default=None, max_length=255)
    programa: Optional[str] = Field(default=None, max_length=255)

    campos_extras: Optional[dict] = None
    observacoes: Optional[str] = None


class DemandaCreate(DemandaBase):
    """Criação. `rascunho` guarda a demanda fora das listas operacionais (§122)."""

    rascunho: bool = False
    tags: list[str] = Field(default_factory=list)


class DemandaUpdate(BaseModel):
    """Atualização parcial. Campos ausentes ficam como estão.

    Status, conclusão, bloqueio e arquivamento têm rotas próprias: passam por
    regras e geram evento na timeline, então não se alteram por PATCH genérico.
    """

    model_config = ConfigDict(extra="forbid")

    titulo: Optional[str] = Field(default=None, min_length=3, max_length=500)
    descricao: Optional[str] = None
    resumo_executivo: Optional[str] = None
    objeto: Optional[str] = None
    assunto: Optional[str] = None
    tipo_id: Optional[uuid.UUID] = None
    categoria_id: Optional[uuid.UUID] = None
    subcategoria_id: Optional[uuid.UUID] = None
    prioridade: Optional[PrioridadeDemanda] = None
    criticidade: Optional[str] = None
    impacto: Optional[str] = None
    confidencialidade: Optional[ConfidencialidadeDemanda] = None
    origem: Optional[OrigemDemanda] = None
    origem_descricao: Optional[str] = None
    autoridade_id: Optional[uuid.UUID] = None
    solicitante_id: Optional[uuid.UUID] = None
    solicitante_externo: Optional[str] = None
    responsavel_geral_id: Optional[uuid.UUID] = None
    gestor_id: Optional[uuid.UUID] = None
    setor_solicitante_id: Optional[uuid.UUID] = None
    template_fluxo_id: Optional[uuid.UUID] = None
    fluxo_livre: Optional[bool] = None
    proxima_acao: Optional[str] = None
    proxima_acao_responsavel_id: Optional[uuid.UUID] = None
    proxima_acao_prazo: Optional[datetime] = None
    data_solicitacao: Optional[date] = None
    prazo_final: Optional[datetime] = None
    prazo_legal: Optional[datetime] = None
    prazo_interno: Optional[datetime] = None
    previsao_conclusao: Optional[datetime] = None
    valor_previsto: Optional[Decimal] = None
    valor_aprovado: Optional[Decimal] = None
    valor_contratado: Optional[Decimal] = None
    valor_executado: Optional[Decimal] = None
    fonte_recurso: Optional[str] = None
    esfera: Optional[EsferaRecurso] = None
    orgao_concedente: Optional[str] = None
    programa: Optional[str] = None
    campos_extras: Optional[dict] = None
    observacoes: Optional[str] = None


class DemandaListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID
    numero: str
    titulo: str
    prioridade: PrioridadeDemanda
    confidencialidade: ConfidencialidadeDemanda
    progresso: int
    prazo_final: Optional[datetime] = None
    ultima_movimentacao_em: datetime
    bloqueada: bool
    is_rascunho: bool
    arquivada_em: Optional[datetime] = None
    concluida_em: Optional[datetime] = None

    tipo: Optional[CatalogoOut] = None
    categoria: Optional[CatalogoOut] = None
    status: Optional[CatalogoOut] = None
    responsavel_geral: Optional[PessoaOut] = None
    responsavel_atual: Optional[PessoaOut] = None
    setor_atual: Optional[SetorOut] = None

    # Derivados — calculados no modelo, nunca persistidos.
    atrasada: bool = False
    dias_sem_movimentacao: int = 0
    tags: list[str] = Field(default_factory=list, validation_alias="tags_rotulos")


class DemandaDetailOut(DemandaListItem):
    descricao: Optional[str] = None
    resumo_executivo: Optional[str] = None
    objeto: Optional[str] = None
    assunto: Optional[str] = None
    exercicio: int
    sequencial: int
    origem: Optional[OrigemDemanda] = None
    origem_descricao: Optional[str] = None
    proxima_acao: Optional[str] = None
    proxima_acao_prazo: Optional[datetime] = None
    bloqueio_motivo: Optional[str] = None
    bloqueio_desde: Optional[datetime] = None
    bloqueio_previsao: Optional[datetime] = None
    aguardando_terceiro: Optional[str] = None
    aguardando_desde: Optional[datetime] = None
    proximo_followup: Optional[date] = None
    data_solicitacao: Optional[date] = None
    prazo_legal: Optional[datetime] = None
    prazo_interno: Optional[datetime] = None
    previsao_conclusao: Optional[datetime] = None
    valor_previsto: Optional[Decimal] = None
    valor_aprovado: Optional[Decimal] = None
    valor_contratado: Optional[Decimal] = None
    valor_executado: Optional[Decimal] = None
    # Derivados dos lançamentos financeiros (§59, §61): somente leitura.
    valor_contrapartida: Optional[Decimal] = None
    valor_licitado: Optional[Decimal] = None
    valor_empenhado: Optional[Decimal] = None
    valor_liquidado: Optional[Decimal] = None
    valor_pago: Optional[Decimal] = None
    fonte_recurso: Optional[str] = None
    esfera: Optional[EsferaRecurso] = None
    orgao_concedente: Optional[str] = None
    programa: Optional[str] = None
    resultado_final: Optional[str] = None
    motivo_cancelamento: Optional[str] = None
    campos_extras: Optional[dict] = None
    observacoes: Optional[str] = None
    created_at: datetime
    # Estado do usuário que pediu o detalhe (§45, §46) — o botão "Acompanhar"
    # precisa saber se já está ligado, em vez de adivinhar pelo clique.
    seguindo: bool = False
    favorito: bool = False


class DemandaPage(BaseModel):
    """Listagem paginada (§129) — nunca devolve a base inteira."""

    items: list[DemandaListItem]
    total: int
    page: int
    page_size: int
    pages: int


class AlterarStatusRequest(BaseModel):
    status_id: uuid.UUID
    justificativa: Optional[str] = None


class BloquearRequest(BaseModel):
    motivo: str = Field(min_length=3)
    previsao_solucao: Optional[datetime] = None
    aguardando_terceiro: Optional[str] = None


class ConcluirRequest(BaseModel):
    """Conclusão exige resumo do resultado — nada de conclusão silenciosa (§145)."""

    resultado: str = Field(min_length=3)
    valor_final: Optional[Decimal] = None
    observacoes: Optional[str] = None
    forcar: bool = Field(
        default=False,
        description="Conclui apesar de pendências não bloqueantes; exige permissão de edição",
    )


class ChecagemConclusao(BaseModel):
    """Pré-visualização do que impede ou preocupa antes de concluir (§145)."""

    pode_concluir: bool
    impedimentos: list[str]
    alertas: list[str]
    tarefas_abertas: int
    protocolos_pendentes: int
    checklists_pendentes: list[str] = []


class CancelarRequest(BaseModel):
    motivo: str = Field(min_length=3)


class ReabrirRequest(BaseModel):
    justificativa: str = Field(min_length=3)


class ProximaAcaoRequest(BaseModel):
    descricao: str = Field(min_length=3)
    responsavel_id: Optional[uuid.UUID] = None
    prazo: Optional[datetime] = None
