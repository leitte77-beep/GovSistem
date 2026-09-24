"""Schemas de máquinas, veículos, habilitações, combustível e manutenção."""

import uuid
from datetime import date, datetime

from pydantic import Field, field_validator

from app.core.br_validators import apenas_digitos, normalizar_placa, placa_valida
from app.schemas.comuns import ArquivoOut, Base


class CategoriaMaquinaEntrada(Base):
    chave: str = Field(..., min_length=2, max_length=60)
    nome: str = Field(..., min_length=2, max_length=120)
    descricao: str | None = None
    exige_cnh_categoria: str | None = Field(None, max_length=10)
    exige_curso: str | None = Field(None, max_length=120)
    consumo_medio_litros_hora: float | None = Field(None, ge=0, le=500)
    ativo: bool = True
    ordem: int = 0


class CategoriaMaquinaOut(CategoriaMaquinaEntrada):
    id: uuid.UUID
    maquinas: int = 0


class MaquinaEntrada(Base):
    codigo: str = Field(..., min_length=1, max_length=30)
    patrimonio: str | None = Field(None, max_length=40)
    categoria_id: uuid.UUID | None = None
    nome: str = Field(..., min_length=2, max_length=150)
    tipo: str | None = Field(None, max_length=80)
    marca: str | None = Field(None, max_length=80)
    modelo: str | None = Field(None, max_length=80)
    ano: int | None = Field(None, ge=1900, le=2100)
    placa: str | None = None
    chassi: str | None = Field(None, max_length=40)
    numero_serie: str | None = Field(None, max_length=60)

    horimetro_atual: float | None = Field(None, ge=0)
    capacidade: str | None = Field(None, max_length=80)
    tipo_combustivel: str = "diesel_s10"
    capacidade_tanque_litros: float | None = Field(None, ge=0, le=10000)
    consumo_medio_litros_hora: float | None = Field(None, ge=0, le=500)

    localizacao_atual: str | None = Field(None, max_length=300)
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    data_aquisicao: date | None = None
    valor_aquisicao: float | None = Field(None, ge=0)
    observacoes: str | None = None
    # Correção de horímetro para valor menor exige justificativa + permissão.
    justificativa_medidor: str | None = None

    @field_validator("placa")
    @classmethod
    def _placa(cls, valor: str | None) -> str | None:
        if not valor:
            return None
        limpa = normalizar_placa(valor)
        if not placa_valida(limpa):
            raise ValueError("Placa inválida — use o padrão ABC1234 ou ABC1D23.")
        return limpa


class MaquinaResumo(Base):
    id: uuid.UUID
    codigo: str
    nome: str
    categoria: str | None = None
    marca: str | None = None
    modelo: str | None = None
    situacao: str
    situacao_rotulo: str
    horimetro_atual: float = 0
    localizacao_atual: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class MaquinaDetalhe(MaquinaResumo):
    patrimonio: str | None = None
    categoria_id: uuid.UUID | None = None
    tipo: str | None = None
    ano: int | None = None
    placa: str | None = None
    chassi: str | None = None
    numero_serie: str | None = None
    capacidade: str | None = None
    tipo_combustivel: str = "diesel_s10"
    capacidade_tanque_litros: float | None = None
    consumo_medio_litros_hora: float | None = None
    consumo_apurado_litros_hora: float | None = None
    data_aquisicao: date | None = None
    valor_aquisicao: float | None = None
    observacoes: str | None = None
    data_baixa: date | None = None
    motivo_baixa: str | None = None
    created_at: datetime
    manutencao_prevista: date | None = None
    horas_no_periodo: float = 0
    arquivos: list[ArquivoOut] = []


class VeiculoEntrada(Base):
    codigo: str = Field(..., min_length=1, max_length=30)
    patrimonio: str | None = Field(None, max_length=40)
    placa: str
    renavam: str | None = None
    nome: str = Field(..., min_length=2, max_length=150)
    marca: str | None = Field(None, max_length=80)
    modelo: str | None = Field(None, max_length=80)
    ano: int | None = Field(None, ge=1900, le=2100)
    tipo: str = "caminhao_basculante"
    tipo_carroceria: str | None = Field(None, max_length=80)
    capacidade: str | None = Field(None, max_length=80)
    transporta_cacamba: bool = False

    odometro_atual: float | None = Field(None, ge=0)
    tipo_combustivel: str = "diesel_s10"
    capacidade_tanque_litros: float | None = Field(None, ge=0, le=10000)
    consumo_medio_km_litro: float | None = Field(None, ge=0, le=100)

    data_aquisicao: date | None = None
    valor_aquisicao: float | None = Field(None, ge=0)
    licenciamento_ate: date | None = None
    seguro_ate: date | None = None
    vencimentos: dict = {}

    localizacao_atual: str | None = Field(None, max_length=300)
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    observacoes: str | None = None
    justificativa_medidor: str | None = None

    @field_validator("placa")
    @classmethod
    def _placa(cls, valor: str) -> str:
        limpa = normalizar_placa(valor)
        if not placa_valida(limpa):
            raise ValueError("Placa inválida — use o padrão ABC1234 ou ABC1D23.")
        return limpa

    @field_validator("renavam")
    @classmethod
    def _renavam(cls, valor: str | None) -> str | None:
        if not valor:
            return None
        numeros = apenas_digitos(valor)
        if len(numeros) not in (9, 10, 11):
            raise ValueError("RENAVAM inválido — informe de 9 a 11 dígitos.")
        return numeros


class VeiculoResumo(Base):
    id: uuid.UUID
    codigo: str
    placa: str
    nome: str
    tipo: str
    situacao: str
    situacao_rotulo: str
    odometro_atual: float = 0
    transporta_cacamba: bool = False
    latitude: float | None = None
    longitude: float | None = None


class VeiculoDetalhe(VeiculoResumo):
    patrimonio: str | None = None
    # Mascarado quando falta `govinfra.veiculos.ver_renavam`.
    renavam: str | None = None
    renavam_mascarado: bool = True
    marca: str | None = None
    modelo: str | None = None
    ano: int | None = None
    tipo_carroceria: str | None = None
    capacidade: str | None = None
    tipo_combustivel: str = "diesel_s10"
    capacidade_tanque_litros: float | None = None
    consumo_medio_km_litro: float | None = None
    consumo_apurado_km_litro: float | None = None
    data_aquisicao: date | None = None
    valor_aquisicao: float | None = None
    licenciamento_ate: date | None = None
    seguro_ate: date | None = None
    vencimentos: dict = {}
    localizacao_atual: str | None = None
    observacoes: str | None = None
    data_baixa: date | None = None
    created_at: datetime
    documentos_vencendo: list[dict] = []
    arquivos: list[ArquivoOut] = []


class MudancaSituacaoEquipamento(Base):
    situacao: str
    motivo: str | None = Field(None, max_length=300)


class LeituraMedidorEntrada(Base):
    valor: float = Field(..., ge=0)
    origem: str = "apontamento"
    justificativa: str | None = Field(None, max_length=2000)


class LeituraMedidorOut(Base):
    id: uuid.UUID
    tipo: str
    valor_anterior: float | None = None
    valor: float
    origem: str
    correcao: bool
    justificativa: str | None = None
    created_at: datetime
    usuario: str | None = None


class HabilitacaoEntrada(Base):
    user_id: uuid.UUID
    funcao: str | None = Field(None, max_length=120)
    cnh_numero: str | None = Field(None, max_length=20)
    cnh_categoria: str | None = Field(None, max_length=10)
    cnh_validade: date | None = None
    cursos: list[dict] = []
    categorias_autorizadas: list[str] = []
    maquinas_autorizadas: list[str] = []
    veiculos_autorizados: list[str] = []
    opera_maquinas: bool = False
    dirige_veiculos: bool = False
    jornada_inicio: str | None = Field(None, pattern=r"^\d{2}:\d{2}$")
    jornada_fim: str | None = Field(None, pattern=r"^\d{2}:\d{2}$")
    jornada_maxima_horas: float | None = Field(None, ge=0, le=24)
    escala: str | None = Field(None, max_length=120)
    afastamentos: list[dict] = []
    situacao: str = "ativa"
    observacoes: str | None = None


class HabilitacaoOut(HabilitacaoEntrada):
    id: uuid.UUID
    nome: str | None = None
    matricula: str | None = None
    email: str | None = None
    perfil: str | None = None
    cnh_vencida: bool = False
    dias_para_vencer_cnh: int | None = None
    alertas: list[str] = []
    created_at: datetime


# ── Combustível ──────────────────────────────────────────────────────────────


class TanqueEntrada(Base):
    codigo: str = Field(..., min_length=1, max_length=30)
    nome: str = Field(..., min_length=2, max_length=150)
    tipo_combustivel: str = "diesel_s10"
    local: str | None = Field(None, max_length=200)
    capacidade_litros: float = Field(..., gt=0, le=1000000)
    estoque_minimo_litros: float | None = Field(None, ge=0)
    bombas: list[str] = []
    ativo: bool = True
    observacoes: str | None = None


class TanqueOut(TanqueEntrada):
    id: uuid.UUID
    estoque_atual_litros: float = 0
    abaixo_do_minimo: bool = False
    ocupacao_percentual: int = 0


class MovimentoEstoqueEntrada(Base):
    tipo: str = Field(..., description="entrada | saida | ajuste | perda | transferencia")
    quantidade_litros: float = Field(..., gt=0, le=1000000)
    tanque_destino_id: uuid.UUID | None = None
    fornecedor: str | None = Field(None, max_length=200)
    nota_fiscal: str | None = Field(None, max_length=60)
    lote: str | None = Field(None, max_length=60)
    valor_unitario: float | None = Field(None, ge=0)
    motivo: str | None = Field(None, max_length=300)
    justificativa: str | None = Field(None, max_length=2000)
    permitir_negativo: bool = False


class MovimentoEstoqueOut(Base):
    id: uuid.UUID
    tipo: str
    quantidade_litros: float
    saldo_anterior: float
    saldo_posterior: float
    fornecedor: str | None = None
    nota_fiscal: str | None = None
    valor_unitario: float | None = None
    valor_total: float | None = None
    motivo: str | None = None
    justificativa: str | None = None
    permitiu_negativo: bool = False
    created_at: datetime
    usuario: str | None = None


class AbastecimentoEntrada(Base):
    abastecido_em: datetime | None = None
    maquina_id: uuid.UUID | None = None
    veiculo_id: uuid.UUID | None = None
    operador_id: uuid.UUID | None = None

    quantidade_litros: float = Field(..., gt=0, le=10000)
    tipo_combustivel: str = "diesel_s10"
    valor_unitario: float | None = Field(None, ge=0)

    horimetro: float | None = Field(None, ge=0)
    quilometragem: float | None = Field(None, ge=0)

    tanque_id: uuid.UUID | None = None
    bomba: str | None = Field(None, max_length=60)
    local: str | None = Field(None, max_length=200)
    posto_externo: str | None = Field(None, max_length=200)
    requisicao: str | None = Field(None, max_length=60)
    nota_fiscal: str | None = Field(None, max_length=60)

    ordem_id: uuid.UUID | None = None
    solicitacao_cacamba_id: uuid.UUID | None = None
    latitude: float | None = None
    longitude: float | None = None
    observacoes: str | None = None
    justificativa_medidor: str | None = None
    # Reenvio seguro em rede instável — não duplica o lançamento.
    chave_idempotencia: str | None = Field(None, max_length=120)


class AbastecimentoOut(Base):
    id: uuid.UUID
    abastecido_em: datetime
    maquina_id: uuid.UUID | None = None
    maquina: str | None = None
    veiculo_id: uuid.UUID | None = None
    veiculo: str | None = None
    responsavel: str | None = None
    operador: str | None = None
    quantidade_litros: float
    tipo_combustivel: str
    valor_unitario: float | None = None
    valor_total: float | None = None
    horimetro: float | None = None
    quilometragem: float | None = None
    tanque: str | None = None
    bomba: str | None = None
    local: str | None = None
    posto_externo: str | None = None
    requisicao: str | None = None
    nota_fiscal: str | None = None
    ordem_id: uuid.UUID | None = None
    ordem_numero: str | None = None
    alertas: list[dict] = []
    observacoes: str | None = None
    arquivos: list[ArquivoOut] = []
    created_at: datetime


# ── Manutenção ───────────────────────────────────────────────────────────────


class PlanoManutencaoEntrada(Base):
    nome: str = Field(..., min_length=3, max_length=150)
    descricao: str | None = None
    maquina_id: uuid.UUID | None = None
    veiculo_id: uuid.UUID | None = None
    cacamba_id: uuid.UUID | None = None
    base_gatilho: str = "periodo"
    intervalo_dias: int | None = Field(None, ge=1, le=3650)
    intervalo_km: float | None = Field(None, ge=0)
    intervalo_horas: float | None = Field(None, ge=0)
    antecedencia_alerta_dias: int = Field(15, ge=0, le=365)
    antecedencia_alerta_medidor: float | None = Field(None, ge=0)
    ultima_data: date | None = None
    ultima_medicao: float | None = Field(None, ge=0)
    servicos_previstos: list[str] = []
    recomendacao_fabricante: str | None = None
    ativo: bool = True


class PlanoManutencaoOut(PlanoManutencaoEntrada):
    id: uuid.UUID
    equipamento: str | None = None
    proxima_data: date | None = None
    proxima_medicao: float | None = None
    dias_para_vencer: int | None = None
    vencido: bool = False


class ManutencaoEntrada(Base):
    maquina_id: uuid.UUID | None = None
    veiculo_id: uuid.UUID | None = None
    cacamba_id: uuid.UUID | None = None
    plano_id: uuid.UUID | None = None
    tipo: str = "corretiva"
    data_abertura: date | None = None
    defeito: str | None = None
    diagnostico: str | None = None
    prioridade: str = "normal"
    quilometragem: float | None = Field(None, ge=0)
    horimetro: float | None = Field(None, ge=0)
    servicos: str | None = None
    pecas: list[dict] = []
    oficina: str | None = Field(None, max_length=200)
    fornecedor: str | None = Field(None, max_length=200)
    custo_pecas: float | None = Field(None, ge=0)
    custo_servicos: float | None = Field(None, ge=0)
    data_prevista: date | None = None
    observacoes: str | None = None


class ManutencaoConclusao(Base):
    data_conclusao: date | None = None
    diagnostico: str | None = None
    servicos: str | None = None
    pecas: list[dict] = []
    custo_pecas: float | None = Field(None, ge=0)
    custo_servicos: float | None = Field(None, ge=0)
    horimetro: float | None = Field(None, ge=0)
    quilometragem: float | None = Field(None, ge=0)
    observacoes: str | None = None
    # Situação para a qual o equipamento volta (padrão: a anterior).
    situacao_equipamento: str | None = None
    justificativa_medidor: str | None = None


class ManutencaoOut(ManutencaoEntrada):
    id: uuid.UUID
    equipamento: str | None = None
    equipamento_tipo: str | None = None
    situacao: str
    data_conclusao: date | None = None
    horas_parado: float | None = None
    custo_total: float | None = None
    responsavel: str | None = None
    dias_em_aberto: int | None = None
    agendamentos_afetados: list[dict] = []
    arquivos: list[ArquivoOut] = []
    created_at: datetime
