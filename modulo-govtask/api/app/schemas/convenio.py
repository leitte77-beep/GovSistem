import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import CategoriaRecurso, EsferaRecurso, PrioridadeProcesso, StatusConvenio, TipoConvenio
from app.schemas.etapa import EtapaOut
from app.schemas.anexo import AnexoOut
from app.schemas.tarefa import TarefaListItem


class ConvenioCreate(BaseModel):
    titulo: str = Field(..., max_length=500)
    descricao: str | None = None
    tipo: TipoConvenio = TipoConvenio.OUTRO
    origem: str | None = None
    valor: Decimal | None = None
    template_fluxo_id: uuid.UUID | None = None
    categoria: CategoriaRecurso | None = None
    esfera: EsferaRecurso | None = None
    prioridade: PrioridadeProcesso | None = None
    situacao: str | None = None
    parlamentar: str | None = None
    parlamentar_cargo: str | None = None
    partido: str | None = None
    orgao_concedente: str | None = None
    programa: str | None = None
    finalidade: str | None = None
    numero_proposta: str | None = None
    numero_instrumento: str | None = None
    numero_convenio: str | None = None
    numero_contrato_repasse: str | None = None
    numero_emenda: str | None = None
    numero_plano_acao: str | None = None
    numero_plano_trabalho: str | None = None
    valor_solicitado: Decimal | None = None
    valor_aprovado: Decimal | None = None
    valor_repasse: Decimal | None = None
    contrapartida: Decimal | None = None
    data_aprovacao: datetime | None = None
    data_assinatura: datetime | None = None
    vigencia_inicio: datetime | None = None
    vigencia_fim: datetime | None = None
    prazo_execucao: datetime | None = None
    prazo_prestacao_contas: datetime | None = None
    previsao_conclusao: datetime | None = None
    gestor_id: uuid.UUID | None = None
    fiscal_id: uuid.UUID | None = None
    engenheiro_id: uuid.UUID | None = None
    links_externos: dict | None = None
    identificadores_externos: dict | None = None


class ConvenioUpdate(BaseModel):
    titulo: str | None = Field(None, max_length=500)
    descricao: str | None = None
    tipo: TipoConvenio | None = None
    origem: str | None = None
    valor: Decimal | None = None
    status: StatusConvenio | None = None
    template_fluxo_id: uuid.UUID | None = None
    categoria: CategoriaRecurso | None = None
    esfera: EsferaRecurso | None = None
    prioridade: PrioridadeProcesso | None = None
    situacao: str | None = None
    parlamentar: str | None = None
    parlamentar_cargo: str | None = None
    partido: str | None = None
    orgao_concedente: str | None = None
    programa: str | None = None
    finalidade: str | None = None
    numero_proposta: str | None = None
    numero_instrumento: str | None = None
    numero_convenio: str | None = None
    numero_contrato_repasse: str | None = None
    numero_emenda: str | None = None
    numero_plano_acao: str | None = None
    numero_plano_trabalho: str | None = None
    valor_solicitado: Decimal | None = None
    valor_aprovado: Decimal | None = None
    valor_repasse: Decimal | None = None
    contrapartida: Decimal | None = None
    valor_executado: Decimal | None = None
    valor_pago: Decimal | None = None
    saldo: Decimal | None = None
    data_aprovacao: datetime | None = None
    data_assinatura: datetime | None = None
    vigencia_inicio: datetime | None = None
    vigencia_fim: datetime | None = None
    prazo_execucao: datetime | None = None
    prazo_prestacao_contas: datetime | None = None
    previsao_conclusao: datetime | None = None
    conclusao_efetiva: datetime | None = None
    gestor_id: uuid.UUID | None = None
    fiscal_id: uuid.UUID | None = None
    engenheiro_id: uuid.UUID | None = None
    links_externos: dict | None = None
    identificadores_externos: dict | None = None


class ProtocoloRequest(BaseModel):
    numero_protocolo: str = Field(..., max_length=100)
    data_protocolo: datetime | None = None


class ConvenioOut(BaseModel):
    id: uuid.UUID
    titulo: str
    descricao: str | None
    tipo: TipoConvenio
    origem: str | None
    numero_protocolo_governo: str | None
    valor: Decimal | None
    status: StatusConvenio
    data_protocolo: datetime | None
    responsavel_id: uuid.UUID
    template_fluxo_id: uuid.UUID | None
    categoria: str | None
    esfera: str | None
    prioridade: str | None
    situacao: str | None
    parlamentar: str | None
    parlamentar_cargo: str | None
    partido: str | None
    orgao_concedente: str | None
    programa: str | None
    finalidade: str | None
    numero_proposta: str | None
    numero_instrumento: str | None
    numero_convenio: str | None
    numero_contrato_repasse: str | None
    numero_emenda: str | None
    numero_plano_acao: str | None
    numero_plano_trabalho: str | None
    valor_solicitado: Decimal | None
    valor_aprovado: Decimal | None
    valor_repasse: Decimal | None
    contrapartida: Decimal | None
    valor_executado: Decimal | None
    valor_pago: Decimal | None
    saldo: Decimal | None
    data_aprovacao: datetime | None
    data_assinatura: datetime | None
    vigencia_inicio: datetime | None
    vigencia_fim: datetime | None
    prazo_execucao: datetime | None
    prazo_prestacao_contas: datetime | None
    previsao_conclusao: datetime | None
    conclusao_efetiva: datetime | None
    gestor_id: uuid.UUID | None
    fiscal_id: uuid.UUID | None
    engenheiro_id: uuid.UUID | None
    links_externos: dict | None
    identificadores_externos: dict | None
    etapas: list["EtapaOut"] = []
    anexos: list["AnexoOut"] = []
    tarefas: list["TarefaListItem"] = []
    created_at: datetime
    updated_at: datetime

    # Campos computados (enriquecimento do detalhe)
    percentual_administrativo: float | None = None
    percentual_fisico: float | None = None
    percentual_financeiro: float | None = None
    etapa_atual: str | None = None
    proximo_prazo: datetime | None = None
    tarefas_abertas: int = 0
    tarefas_atrasadas: int = 0
    valor_recebido: Decimal | None = None
    ultima_movimentacao: datetime | None = None

    model_config = {"from_attributes": True}


class ConvenioDetailOut(ConvenioOut):
    responsavel: dict | None = None


class ConvenioListItem(BaseModel):
    id: uuid.UUID
    titulo: str
    tipo: TipoConvenio
    origem: str | None = None
    numero_protocolo_governo: str | None = None
    valor: Decimal | None = None
    status: StatusConvenio
    categoria: str | None = None
    esfera: str | None = None
    situacao: str | None = None
    prioridade: str | None = None
    numero_emenda: str | None = None
    parlamentar: str | None = None
    orgao_concedente: str | None = None
    etapa_atual: str | None = None
    proximo_prazo: datetime | None = None
    percentual_fisico: float | None = None
    percentual_financeiro: float | None = None
    tarefas_abertas: int = 0
    pendencias: int = 0
    responsavel: dict | None = None
    responsavel_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
