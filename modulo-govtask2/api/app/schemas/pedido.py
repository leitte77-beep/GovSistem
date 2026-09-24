"""Contratos da API. Um arquivo só — o domínio cabe nele."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.fluxo import TipoPedido
from app.models.pedido import MotivoParada, OrigemPedido, Prioridade


class PedidoCriar(BaseModel):
    titulo: str = Field(min_length=3, max_length=255)
    tipo: TipoPedido
    descricao: Optional[str] = Field(default=None, max_length=8000)
    origem: OrigemPedido = OrigemPedido.PREFEITO
    origem_nome: Optional[str] = Field(default=None, max_length=180)
    valor_previsto: Optional[Decimal] = Field(default=None, ge=0, le=Decimal("999999999.99"))
    prioridade: Prioridade = Prioridade.NORMAL
    emenda: Optional[str] = Field(default=None, max_length=80)
    partido: Optional[str] = Field(default=None, max_length=30)
    endereco: Optional[str] = Field(default=None, max_length=255)

    @field_validator("titulo")
    @classmethod
    def _titulo_limpo(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 3:
            raise ValueError("Título muito curto.")
        return v


class PedidoEditar(BaseModel):
    """Só o que é descritivo. Situação muda por ação, nunca por PATCH."""

    titulo: Optional[str] = Field(default=None, min_length=3, max_length=255)
    descricao: Optional[str] = Field(default=None, max_length=8000)
    origem: Optional[OrigemPedido] = None
    origem_nome: Optional[str] = Field(default=None, max_length=180)
    valor_previsto: Optional[Decimal] = Field(default=None, ge=0)
    valor_liberado: Optional[Decimal] = Field(default=None, ge=0)
    valor_pago: Optional[Decimal] = Field(default=None, ge=0)
    prioridade: Optional[Prioridade] = None
    protocolo_externo: Optional[str] = Field(default=None, max_length=80)
    protocolo_sistema: Optional[str] = Field(default=None, max_length=80)
    protocolo_orgao: Optional[str] = Field(default=None, max_length=180)
    protocolo_data: Optional[date] = None
    emenda: Optional[str] = Field(default=None, max_length=80)
    partido: Optional[str] = Field(default=None, max_length=30)
    endereco: Optional[str] = Field(default=None, max_length=255)
    latitude: Optional[Decimal] = Field(default=None, ge=-90, le=90)
    longitude: Optional[Decimal] = Field(default=None, ge=-180, le=180)
    valor_empenhado: Optional[Decimal] = Field(default=None, ge=0)
    protocolo_situacao: Optional[str] = Field(default=None, max_length=255)


class ParadaRequest(BaseModel):
    """Por que o pedido está parado. `motivo` nulo retira a parada."""

    motivo: Optional[MotivoParada] = None
    texto: Optional[str] = Field(default=None, max_length=2000)


class EncaminharRequest(BaseModel):
    """O Assessor manda o pedido a um setor."""

    setor: str = Field(min_length=1, max_length=40)
    assunto: str = Field(min_length=1, max_length=160)
    instrucoes: Optional[str] = Field(default=None, max_length=8000)
    # Sem prazo, o sistema sugere pelo setor de destino.
    prazo: Optional[date] = None
    # Opcional: o Assessor já entrega direto a um engenheiro específico.
    responsavel_id: Optional[uuid.UUID] = None
    # Entregáveis que o setor vai marcar ("CND federal", "CND estadual"…).
    checklist: Optional[list[str]] = Field(default=None, max_length=30)


class TransferirRequest(BaseModel):
    responsavel_id: uuid.UUID
    motivo: Optional[str] = Field(default=None, max_length=2000)


class MencionarRequest(BaseModel):
    usuarios_ids: list[uuid.UUID] = Field(min_length=1)


class ComplementoSolicitarRequest(BaseModel):
    texto: str = Field(min_length=3, max_length=4000)


class ComplementoResponderRequest(BaseModel):
    texto: str = Field(min_length=1, max_length=8000)


class PrazoRequest(BaseModel):
    prazo: date
    motivo: Optional[str] = Field(default=None, max_length=2000)


class MedicaoRequest(BaseModel):
    periodo_inicio: Optional[date] = None
    periodo_fim: Optional[date] = None
    valor: Optional[Decimal] = Field(default=None, ge=0)
    percentual_executado: Optional[Decimal] = Field(default=None, ge=0, le=100)
    observacao: Optional[str] = Field(default=None, max_length=8000)


class DevolverRequest(BaseModel):
    # Vazio usa o rascunho salvo da tarefa.
    resultado: str = Field(default="", max_length=8000)


class ItemChecklist(BaseModel):
    item: str = Field(min_length=1, max_length=200)
    feito: bool = False


class RascunhoRequest(BaseModel):
    texto: Optional[str] = Field(default=None, max_length=8000)
    checklist: Optional[list[ItemChecklist]] = Field(default=None, max_length=30)


class TextoRequest(BaseModel):
    texto: Optional[str] = Field(default=None, max_length=4000)


class MotivoRequest(BaseModel):
    motivo: str = Field(min_length=3, max_length=2000)


class ComentarioRequest(BaseModel):
    texto: str = Field(min_length=1, max_length=4000)
    # Conversa de qual tarefa; sem ela, a tarefa aberta (ou o pedido).
    encaminhamento_id: Optional[uuid.UUID] = None
    mencionados_ids: list[uuid.UUID] = Field(default_factory=list, max_length=20)
    aguardando_resposta: bool = False


class UsuarioResumo(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    email: str
    setor: Optional[str] = None


class DefinirSetorRequest(BaseModel):
    """Corpo do cadastro de setor do usuário. `null` limpa a lotação."""

    setor: Optional[str] = Field(default=None, max_length=40)


class LoteSetorRequest(BaseModel):
    usuario_ids: list[uuid.UUID] = Field(min_length=1)
    setor: Optional[str] = Field(default=None, max_length=40)
    perfil: Optional[str] = Field(default=None, max_length=20)


class EditarUsuarioRequest(BaseModel):
    """Só o que vier muda. `perfil: null` volta a seguir a plataforma."""

    setor: Optional[str] = Field(default=None, max_length=40)
    perfil: Optional[str] = Field(default=None, max_length=20)
    ativo: Optional[bool] = None


class UsuarioAdmin(UsuarioResumo):
    papeis: list[str] = []
    perfil: str = "CONSULTA"
    perfil_definido: Optional[str] = None
    ativo: bool = True
    ultimo_acesso: Optional[datetime] = None
    tarefas_abertas: int = 0


class AuditoriaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    autor_nome: str
    alvo_tipo: str
    alvo_nome: str
    campo: str
    antes: Optional[str]
    depois: Optional[str]
    created_at: datetime


class SetorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    codigo: str
    nome: str
    ativo: bool
    sistema: bool
    # Prazo definido pela prefeitura; vazio segue o padrão do código.
    prazo_dias: Optional[int] = None
    # Prazo que o sistema sugere ao encaminhar para este setor.
    prazo_sugerido_dias: int = 5
    responsavel_id: Optional[uuid.UUID] = None
    pessoas: int = 0
    abertos: int = 0

    @model_validator(mode="after")
    def _prazo_do_setor(self):
        from app.core.fluxo import PRAZO_SUGERIDO_PADRAO, PRAZOS_SUGERIDOS

        self.prazo_sugerido_dias = self.prazo_dias or PRAZOS_SUGERIDOS.get(
            self.codigo.upper(), PRAZO_SUGERIDO_PADRAO
        )
        return self


class SetorCriar(BaseModel):
    nome: str = Field(min_length=2, max_length=120)


class SetorEditar(BaseModel):
    nome: Optional[str] = Field(default=None, min_length=2, max_length=120)
    ativo: Optional[bool] = None
    prazo_dias: Optional[int] = Field(default=None, ge=1, le=365)
    responsavel_id: Optional[uuid.UUID] = None


class AnexoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    encaminhamento_id: Optional[uuid.UUID]
    medicao_id: Optional[uuid.UUID]
    categoria: str = "DOCUMENTO"
    nome_original: str
    tamanho_bytes: int
    content_type: Optional[str]
    descricao: Optional[str]
    created_at: datetime
    enviado_por: Optional[UsuarioResumo] = None
    # Posição dentro do mesmo documento: v1, v2, v3… Nada é sobrescrito.
    versao: int = 1
    tipo_documento: Optional[str] = None
    legenda: Optional[str] = None


class AnexoEditar(BaseModel):
    tipo_documento: Optional[str] = Field(default=None, max_length=20)
    legenda: Optional[str] = Field(default=None, max_length=255)


class MedicaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    encaminhamento_id: Optional[uuid.UUID]
    numero: int
    periodo_inicio: Optional[date]
    periodo_fim: Optional[date]
    valor: Optional[Decimal]
    percentual_executado: Optional[Decimal]
    observacao: Optional[str]
    created_at: datetime
    responsavel: Optional[UsuarioResumo] = None
    fotos: list[AnexoOut] = []


class ProximaAcaoOut(BaseModel):
    """A resposta a "e agora?": o que fazer, onde, com quem e até quando."""

    titulo: str
    descricao: str = ""
    setor: Optional[str] = None
    responsavel: Optional[UsuarioResumo] = None
    prazo: Optional[date] = None
    dias_de_atraso: int = 0
    bloqueada: bool = False
    motivo_bloqueio: Optional[str] = None


class EncaminhamentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    ordem: int
    setor: str
    assunto: str
    instrucoes: Optional[str]
    status: str
    prazo: Optional[date]
    prazo_sugerido: bool
    assumido_em: Optional[datetime]
    devolvido_em: Optional[datetime]
    resultado: Optional[str]
    complemento_pedido: Optional[str]
    complemento_resposta: Optional[str]
    transferencias: int = 0
    rascunho: Optional[str] = None
    rascunho_em: Optional[datetime] = None
    checklist: list[dict] = []
    created_at: Optional[datetime] = None
    responsavel: Optional[UsuarioResumo] = None
    criado_por: Optional[UsuarioResumo] = None
    participantes: list[UsuarioResumo] = []
    anexos: list[AnexoOut] = []
    medicoes: list[MedicaoOut] = []

    @field_validator("participantes", mode="before")
    @classmethod
    def _ignorar_ids_crus(cls, v):
        # O modelo guarda ids (JSONB); a montagem resolve os nomes depois.
        if isinstance(v, list) and v and isinstance(v[0], str):
            return []
        return v or []


class AndamentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    encaminhamento_id: Optional[uuid.UUID]
    tipo: str
    texto: Optional[str]
    autor_nome: str
    autor_id: Optional[uuid.UUID] = None
    created_at: datetime
    dados: Optional[dict] = None


class PedidoLista(BaseModel):
    """Linha da lista. Sem encaminhamentos nem anexos — leve de propósito."""

    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    numero: str
    titulo: str
    tipo: str
    situacao: str
    prioridade: str
    origem: str
    origem_nome: Optional[str]
    valor_previsto: Optional[Decimal]
    setor_atual: Optional[str]
    responsavel_atual: Optional[UsuarioResumo] = None
    prazo_atual: Optional[date]
    complemento_pendente: bool = False
    # Assunto do encaminhamento aberto, para o card do departamento.
    tarefa_atual: str = ""
    dias_de_atraso: int = 0
    created_at: datetime
    proxima_acao: str = ""
    saude: str = "NORMAL"
    saude_motivo: str = ""
    emenda: Optional[str] = None
    # Onde está, há quanto tempo e por quê.
    situacao_desde: Optional[datetime] = None
    dias_na_situacao: int = 0
    motivo_parada: Optional[str] = None
    motivo_parada_texto: Optional[str] = None
    motivo_parada_em: Optional[datetime] = None
    ultima_movimentacao_em: Optional[datetime] = None


class PedidoDetalhe(PedidoLista):
    descricao: Optional[str]
    protocolo_externo: Optional[str]
    protocolo_sistema: Optional[str]
    protocolo_orgao: Optional[str]
    protocolo_data: Optional[date]
    valor_liberado: Optional[Decimal]
    valor_pago: Optional[Decimal]
    concluido_em: Optional[datetime]
    motivo_cancelamento: Optional[str]
    criado_por: Optional[UsuarioResumo] = None
    encaminhamento_atual: Optional[EncaminhamentoOut] = None
    encaminhamentos: list[EncaminhamentoOut] = []
    andamentos: list[AndamentoOut] = []
    anexos: list[AnexoOut] = []
    medicoes: list[MedicaoOut] = []
    proxima_acao_detalhe: Optional[ProximaAcaoOut] = None
    saude_motivos: list[str] = []
    partido: Optional[str] = None
    endereco: Optional[str] = None
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None
    valor_empenhado: Optional[Decimal] = None
    protocolo_situacao: Optional[str] = None
    indicadores: Optional["Indicadores"] = None


class Indicadores(BaseModel):
    """Onde o tempo do pedido foi gasto."""

    horas_total: float = 0
    horas_com_assessor: float = 0
    horas_nos_setores: float = 0
    horas_aguardando_governo: float = 0
    idas_e_vindas: int = 0
    # Horas por setor, somando todas as passagens.
    por_setor: dict[str, float] = {}
    pessoas: list[str] = []


class PaginaPedidos(BaseModel):
    itens: list[PedidoLista]
    total: int
    pagina: int
    tamanho: int


class ContagemPainel(BaseModel):
    comigo: int
    atrasados: int
    aguardando_terceiro: int
    em_setor: int
    concluidos_no_ano: int
    valor_em_andamento: Decimal


class ContagemPorSetor(BaseModel):
    setor: str
    nome: str
    abertos: int
    atrasados: int
    valor: Decimal


class ContagemSetor(BaseModel):
    abertas: int
    atrasadas: int
    sem_responsavel: int
    comigo: int


class MeuSetorResposta(BaseModel):
    """A tela de um departamento: o que está na mesa dele agora."""

    setor: Optional[SetorOut] = None
    contagens: ContagemSetor
    tarefas: list[PedidoLista] = []


class PainelResposta(BaseModel):
    contagens: ContagemPainel
    minha_caixa: list[PedidoLista]
    atrasados: list[PedidoLista]
    por_setor: list[ContagemPorSetor] = []


class NotificacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    pedido_id: Optional[uuid.UUID]
    encaminhamento_id: Optional[uuid.UUID]
    tipo: str
    texto: str
    autor_nome: str
    lida_em: Optional[datetime]
    created_at: datetime


class NotificacoesResposta(BaseModel):
    nao_lidas: int
    itens: list[NotificacaoOut] = []


# ── Painéis por perfil ──────────────────────────────────────────────────


class KpisPrefeito(BaseModel):
    em_andamento: int
    parados: int
    atrasados: int
    aguardando_governo: int
    concluidos_no_mes: int
    concluidos_no_ano: int
    valor_previsto: Decimal
    valor_liberado: Decimal
    valor_pago: Decimal


class GargaloSetor(BaseModel):
    setor: str
    nome: str
    abertos: int
    parados: int
    atrasados: int
    # Média de dias que os pedidos abertos estão no setor agora.
    dias_medios_agora: float
    # Média histórica de dias por passagem já devolvida pelo setor.
    dias_medios_historico: Optional[float] = None
    passagens_concluidas: int = 0


class FatiaContagem(BaseModel):
    chave: str
    rotulo: str
    quantidade: int
    valor: Decimal = Decimal(0)


class ObraResumo(BaseModel):
    id: uuid.UUID
    numero: str
    titulo: str
    situacao: str
    setor_atual: Optional[str]
    percentual_executado: Optional[Decimal] = None
    ultima_medicao_em: Optional[datetime] = None
    valor_previsto: Optional[Decimal] = None
    valor_pago: Optional[Decimal] = None
    foto_id: Optional[uuid.UUID] = None
    dias_na_situacao: int = 0
    motivo_parada: Optional[str] = None


class EventoRecente(BaseModel):
    pedido_id: uuid.UUID
    numero: str
    titulo: str
    tipo: str
    texto: Optional[str]
    autor_nome: str
    created_at: datetime
    # Setor e tarefa em que o evento aconteceu, quando foi dentro de uma tarefa.
    setor: Optional[str] = None
    tarefa: Optional[str] = None


class PainelPrefeito(BaseModel):
    dias_alerta_parado: int
    kpis: KpisPrefeito
    parados: list[PedidoLista] = []
    gargalos: list[GargaloSetor] = []
    por_tipo: list[FatiaContagem] = []
    por_origem: list[FatiaContagem] = []
    por_parlamentar: list[FatiaContagem] = []
    por_motivo: list[FatiaContagem] = []
    obras: list[ObraResumo] = []
    recentes: list[EventoRecente] = []


class PainelAssessor(BaseModel):
    dias_alerta_parado: int
    contagens: dict[str, int]
    caixa: list[PedidoLista] = []
    complementos: list[PedidoLista] = []
    atrasados: list[PedidoLista] = []
    parados: list[PedidoLista] = []
    aguardando_governo: list[PedidoLista] = []
    em_setor: list[PedidoLista] = []
    gargalos: list[GargaloSetor] = []
    recentes: list[EventoRecente] = []


class AjustesOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    dias_alerta_parado: int = 15
    resumo_diario: bool = True
    resumo_hora: int = 7
    resumo_perfis: list[str] = ["PREFEITO"]


class AjustesEditar(BaseModel):
    dias_alerta_parado: Optional[int] = Field(default=None, ge=1, le=365)
    resumo_diario: Optional[bool] = None
    resumo_hora: Optional[int] = Field(default=None, ge=0, le=23)
    resumo_perfis: Optional[list[str]] = Field(default=None, max_length=4)


PedidoDetalhe.model_rebuild()
