"""Schemas da área de caçambas."""

import uuid
from datetime import date, datetime

from pydantic import Field, field_validator

from app.schemas.comuns import ArquivoOut, AssinaturaEntrada, Base
from app.schemas.pessoas import ImovelResumo, PessoaResumo


class CacambaEntrada(Base):
    codigo: str = Field(..., min_length=1, max_length=30)
    patrimonio: str | None = Field(None, max_length=40)
    identificacao_visual: str | None = Field(None, max_length=60)
    tipo: str | None = Field(None, max_length=60)
    modelo: str | None = Field(None, max_length=80)
    capacidade_m3: float | None = Field(None, gt=0, le=100)
    comprimento_m: float | None = Field(None, gt=0, le=50)
    largura_m: float | None = Field(None, gt=0, le=50)
    altura_m: float | None = Field(None, gt=0, le=50)
    cor: str | None = Field(None, max_length=40)
    data_aquisicao: date | None = None
    valor_aquisicao: float | None = Field(None, ge=0)
    estado_conservacao: str | None = Field(None, max_length=40)
    localizacao_padrao: str | None = Field(None, max_length=200)
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    proxima_vistoria_em: date | None = None
    observacoes: str | None = None


class CacambaResumo(Base):
    id: uuid.UUID
    codigo: str
    patrimonio: str | None = None
    identificacao_visual: str | None = None
    capacidade_m3: float | None = None
    situacao: str
    situacao_rotulo: str
    localizacao_atual: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    qr_code: str | None = None


class CacambaDetalhe(CacambaResumo):
    tipo: str | None = None
    modelo: str | None = None
    comprimento_m: float | None = None
    largura_m: float | None = None
    altura_m: float | None = None
    cor: str | None = None
    data_aquisicao: date | None = None
    valor_aquisicao: float | None = None
    estado_conservacao: str | None = None
    localizacao_padrao: str | None = None
    ultima_vistoria_em: date | None = None
    proxima_vistoria_em: date | None = None
    observacoes: str | None = None
    data_baixa: date | None = None
    motivo_baixa: str | None = None
    created_at: datetime
    solicitacao_atual: dict | None = None
    dias_em_uso: int | None = None


class MudancaSituacaoCacamba(Base):
    situacao: str
    motivo: str | None = Field(None, max_length=200)
    localizacao: str | None = Field(None, max_length=300)
    latitude: float | None = None
    longitude: float | None = None
    observacoes: str | None = None


class BaixaCacamba(Base):
    data_baixa: date
    motivo: str = Field(..., min_length=5, max_length=2000)


class MovimentacaoOut(Base):
    id: uuid.UUID
    situacao_anterior: str | None = None
    situacao_nova: str
    situacao_nova_rotulo: str
    localizacao_anterior: str | None = None
    localizacao_nova: str | None = None
    motivo: str | None = None
    observacoes: str | None = None
    created_at: datetime
    usuario: str | None = None


class TipoResiduoEntrada(Base):
    chave: str = Field(..., min_length=2, max_length=60)
    nome: str = Field(..., min_length=2, max_length=150)
    descricao: str | None = None
    proibido: bool = False
    exige_autorizacao: bool = False
    destinacao_padrao: str | None = None
    ativo: bool = True
    ordem: int = 0


class TipoResiduoOut(TipoResiduoEntrada):
    id: uuid.UUID


# ── Solicitação de caçamba (formulário em etapas — item 12) ──────────────────


class SolicitacaoEntrada(Base):
    # Etapa 1 — solicitante
    pessoa_id: uuid.UUID
    imovel_id: uuid.UUID | None = None

    # Etapa 2 — local de instalação
    logradouro: str | None = Field(None, max_length=200)
    numero: str | None = Field(None, max_length=20)
    bairro: str | None = Field(None, max_length=120)
    referencia: str | None = Field(None, max_length=300)
    regiao_id: uuid.UUID | None = None
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    instrucoes_entrega: str | None = None
    espaco_confirmado: bool = False
    acesso_caminhao_confirmado: bool = False
    exige_autorizacao_especial: bool = False

    # Etapa 3 — material
    tipo_residuo_id: uuid.UUID | None = None
    descricao_material: str | None = None
    quantidade_estimada_m3: float | None = Field(None, ge=0, le=1000)
    origem_material: str | None = Field(None, max_length=200)
    materiais_adicionais: list[str] = []
    ciente_itens_proibidos: bool = False

    # Etapa 4 — agendamento
    data_desejada: date | None = None
    dias_previstos: int | None = Field(None, ge=1, le=60)
    prioridade: str = "normal"

    # Etapa 5 — confirmação
    termo_aceito: bool = False
    observacoes: str | None = None
    assinatura: AssinaturaEntrada | None = None

    # Rascunho não passa pelas validações de confirmação.
    rascunho: bool = False
    # Justificativa do gestor ao liberar apesar de bloqueio (item 10.4).
    justificativa_excecao: str | None = Field(None, max_length=2000)


class SolicitacaoAtualizacao(SolicitacaoEntrada):
    pessoa_id: uuid.UUID | None = None
    row_version: int | None = None


class SolicitacaoResumo(Base):
    id: uuid.UUID
    protocolo_formatado: str
    situacao: str
    situacao_rotulo: str
    prioridade: str
    solicitante: str | None = None
    logradouro: str | None = None
    numero: str | None = None
    bairro: str | None = None
    data_agendada: date | None = None
    data_prevista_entrega: date | None = None
    data_prevista_retirada: date | None = None
    cacamba_codigo: str | None = None
    veiculo_placa: str | None = None
    atrasada: bool = False
    dias_atraso: int = 0
    created_at: datetime


class SolicitacaoDetalhe(SolicitacaoResumo):
    ano: int
    pessoa: PessoaResumo | None = None
    imovel: ImovelResumo | None = None
    referencia: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    instrucoes_entrega: str | None = None
    espaco_confirmado: bool = False
    acesso_caminhao_confirmado: bool = False
    exige_autorizacao_especial: bool = False
    tipo_residuo: str | None = None
    descricao_material: str | None = None
    quantidade_estimada_m3: float | None = None
    origem_material: str | None = None
    materiais_adicionais: list[str] = []
    data_desejada: date | None = None
    dias_previstos: int | None = None
    cacamba_id: uuid.UUID | None = None
    veiculo_id: uuid.UUID | None = None
    motorista_id: uuid.UUID | None = None
    equipe: str | None = None
    atendente: str | None = None
    observacoes: str | None = None
    termo_aceito: bool = False
    motivo_reprovacao: str | None = None
    motivo_cancelamento: str | None = None
    justificativa_data: str | None = None
    justificativa_excecao: str | None = None
    row_version: int = 1
    arquivos: list[ArquivoOut] = []
    entregas: list["EntregaOut"] = []
    retiradas: list["RetiradaOut"] = []
    proximas_situacoes: list[str] = []


class AgendamentoEntrada(Base):
    data_agendada: date
    dias_previstos: int | None = Field(None, ge=1, le=60)
    cacamba_id: uuid.UUID | None = None
    veiculo_id: uuid.UUID | None = None
    motorista_id: uuid.UUID | None = None
    equipe: str | None = Field(None, max_length=120)
    # Obrigatória quando a data escolhida tem pontuação baixa (item 15).
    justificativa: str | None = Field(None, max_length=2000)
    # Confirmação consciente diante de conflitos que admitem exceção.
    forcar: bool = False


class RecomendacaoEntrada(Base):
    data_preferida: date | None = None
    dias_uso: int | None = Field(None, ge=1, le=60)
    bairro: str | None = None
    regiao_id: uuid.UUID | None = None
    latitude: float | None = None
    longitude: float | None = None
    prioridade: str = "normal"
    quantidade: int = Field(3, ge=1, le=10)


class EntregaEntrada(Base):
    """Registro operacional da entrega — preenchido no celular (item 16)."""

    cacamba_id: uuid.UUID | None = None
    veiculo_id: uuid.UUID | None = None
    motorista_id: uuid.UUID | None = None
    auxiliares: list[str] = []

    saida_em: datetime | None = None
    km_saida: float | None = Field(None, ge=0)
    latitude_saida: float | None = None
    longitude_saida: float | None = None

    entregue_em: datetime | None = None
    km_chegada: float | None = Field(None, ge=0)
    latitude: float | None = None
    longitude: float | None = None

    recebido_por: str | None = Field(None, max_length=200)
    documento_recebedor: str | None = None
    ocorrencias: str | None = None
    observacoes: str | None = None
    assinatura: AssinaturaEntrada | None = None

    # Entrega sem caçamba/veículo vinculados exige autorização registrada.
    contingencia: bool = False
    justificativa_contingencia: str | None = Field(None, max_length=2000)


class EntregaOut(Base):
    id: uuid.UUID
    cacamba_id: uuid.UUID
    cacamba_codigo: str | None = None
    veiculo_id: uuid.UUID | None = None
    veiculo_placa: str | None = None
    motorista: str | None = None
    saida_em: datetime | None = None
    entregue_em: datetime
    km_saida: float | None = None
    km_chegada: float | None = None
    km_percorridos: float | None = None
    recebido_por: str | None = None
    ocorrencias: str | None = None
    observacoes: str | None = None
    contingencia: bool = False
    latitude: float | None = None
    longitude: float | None = None
    arquivos: list[ArquivoOut] = []


class RetiradaEntrada(Base):
    """Registro operacional da retirada (item 17)."""

    veiculo_id: uuid.UUID | None = None
    motorista_id: uuid.UUID | None = None
    equipe: str | None = Field(None, max_length=120)

    retirada_em: datetime | None = None
    km_saida: float | None = Field(None, ge=0)
    km_chegada: float | None = Field(None, ge=0)
    latitude: float | None = None
    longitude: float | None = None

    tipo_material_encontrado: str | None = Field(None, max_length=200)
    material_proibido: bool = False
    descricao_material_proibido: str | None = None
    peso_kg: float | None = Field(None, ge=0)
    destinacao: str | None = Field(None, max_length=200)

    ocorrencias: str | None = None
    necessita_limpeza: bool = False
    necessita_manutencao: bool = False
    houve_dano: bool = False
    # Destino da caçamba. Quando há ocorrência, o backend recusa "disponivel".
    destino_cacamba: str = "disponivel"
    observacoes: str | None = None
    assinatura: AssinaturaEntrada | None = None

    @field_validator("destino_cacamba")
    @classmethod
    def _destino_valido(cls, valor: str) -> str:
        permitidos = {"disponivel", "limpeza", "vistoria", "manutencao", "indisponivel"}
        if valor not in permitidos:
            raise ValueError(f"Destino inválido. Use um de: {', '.join(sorted(permitidos))}.")
        return valor


class RetiradaOut(Base):
    id: uuid.UUID
    cacamba_id: uuid.UUID
    cacamba_codigo: str | None = None
    veiculo_id: uuid.UUID | None = None
    veiculo_placa: str | None = None
    motorista: str | None = None
    data_prevista: date | None = None
    retirada_em: datetime
    km_saida: float | None = None
    km_chegada: float | None = None
    tipo_material_encontrado: str | None = None
    material_proibido: bool = False
    descricao_material_proibido: str | None = None
    peso_kg: float | None = None
    destinacao: str | None = None
    ocorrencias: str | None = None
    necessita_limpeza: bool = False
    necessita_manutencao: bool = False
    houve_dano: bool = False
    destino_cacamba: str
    latitude: float | None = None
    longitude: float | None = None
    arquivos: list[ArquivoOut] = []


SolicitacaoDetalhe.model_rebuild()
