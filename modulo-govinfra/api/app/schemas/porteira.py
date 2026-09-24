"""Schemas do Programa Porteira Adentro."""

import uuid
from datetime import date, datetime

from pydantic import Field, field_validator

from app.schemas.comuns import ArquivoOut, AssinaturaEntrada, Base
from app.schemas.pessoas import ImovelResumo, PessoaResumo


class ProgramaEntrada(Base):
    chave: str = Field(..., min_length=2, max_length=60)
    nome: str = Field(..., min_length=3, max_length=200)
    descricao: str | None = None
    base_legal: str | None = Field(
        None, max_length=300,
        description="Lei ou decreto municipal que fundamenta os limites do programa",
    )
    vigencia_inicio: date
    vigencia_fim: date | None = None

    horas_por_beneficiario: float | None = Field(None, ge=0, le=10000)
    horas_por_propriedade: float | None = Field(None, ge=0, le=10000)
    regra_limite: str = "cpf"
    metodo_desconto: str = "geral"
    validade_saldo_dias: int | None = Field(None, ge=1, le=3650)
    permite_horas_adicionais: bool = True
    limite_horas_adicionais: float | None = Field(None, ge=0, le=1000)
    exige_vistoria: bool = False
    exige_aprovacao_gestor: bool = True
    permite_cobranca: bool = False
    valor_hora_excedente: float | None = Field(None, ge=0)

    documentos_obrigatorios: list[str] = []
    servicos_permitidos: list[str] = []
    equipamentos_permitidos: list[str] = []
    criterios_prioridade: dict = {}
    pesos_recomendacao: dict = {}
    ativo: bool = True

    @field_validator("regra_limite")
    @classmethod
    def _regra(cls, valor: str) -> str:
        if valor not in {"cpf", "propriedade", "ambos"}:
            raise ValueError("A regra de limite deve ser 'cpf', 'propriedade' ou 'ambos'.")
        return valor

    @field_validator("metodo_desconto")
    @classmethod
    def _metodo(cls, valor: str) -> str:
        permitidos = {"geral", "equipamento_principal", "por_categoria", "administrativo"}
        if valor not in permitidos:
            raise ValueError(f"Método de desconto inválido. Use: {', '.join(sorted(permitidos))}.")
        return valor


class ProgramaOut(ProgramaEntrada):
    id: uuid.UUID
    created_at: datetime
    beneficiarios: int = 0
    horas_concedidas: float = 0
    horas_utilizadas: float = 0


class BeneficiarioEntrada(Base):
    programa_id: uuid.UUID
    pessoa_id: uuid.UUID
    classificacao: str | None = Field(None, max_length=60)
    atividade_produtiva: str | None = Field(None, max_length=200)
    data_entrada: date | None = None
    validade_ate: date | None = None
    observacoes: str | None = None
    # Concessão inicial de horas — gera movimentação no banco de horas.
    horas_iniciais: float | None = Field(None, ge=0, le=10000)


class SaldoOut(Base):
    id: uuid.UUID
    imovel_id: uuid.UUID | None = None
    imovel_nome: str | None = None
    categoria: str | None = None
    periodo_referencia: str
    horas_concedidas: float
    horas_adicionais: float
    horas_reservadas: float
    horas_utilizadas: float
    horas_estornadas: float
    horas_expiradas: float
    saldo_disponivel: float
    validade_ate: date | None = None
    situacao: str


class BeneficiarioOut(Base):
    id: uuid.UUID
    programa_id: uuid.UUID
    programa_nome: str | None = None
    pessoa: PessoaResumo | None = None
    classificacao: str | None = None
    atividade_produtiva: str | None = None
    data_entrada: date
    validade_ate: date | None = None
    situacao: str
    pendencias: str | None = None
    observacoes: str | None = None
    saldos: list[SaldoOut] = []
    saldo_total_disponivel: float = 0
    propriedades: list[ImovelResumo] = []
    bloqueios_ativos: int = 0


class MovimentoHorasOut(Base):
    id: uuid.UUID
    tipo: str
    quantidade: float
    saldo_anterior: float
    saldo_posterior: float
    motivo: str | None = None
    observacao: str | None = None
    ordem_id: uuid.UUID | None = None
    ordem_numero: str | None = None
    created_at: datetime
    usuario: str | None = None


class ConcessaoHorasEntrada(Base):
    quantidade: float = Field(..., gt=0, le=10000)
    imovel_id: uuid.UUID | None = None
    categoria: str | None = None
    motivo: str = Field("Concessão do programa", max_length=300)


class AjusteHorasEntrada(Base):
    quantidade: float = Field(..., gt=0, le=10000)
    credito: bool = True
    justificativa: str = Field(..., min_length=5, max_length=2000)


class TipoServicoEntrada(Base):
    chave: str = Field(..., min_length=2, max_length=60)
    nome: str = Field(..., min_length=3, max_length=150)
    descricao: str | None = None
    categorias_compativeis: list[str] = []
    exige_vistoria: bool = False
    exige_aprovacao_especial: bool = False
    documentos_obrigatorios: list[str] = []
    horas_medias: float | None = Field(None, ge=0, le=1000)
    consumo_medio_litros: float | None = Field(None, ge=0)
    usa_banco_horas: bool = True
    permite_caminhoes: bool = True
    ativo: bool = True
    ordem: int = 0


class TipoServicoOut(TipoServicoEntrada):
    id: uuid.UUID


class SolicitacaoServicoEntrada(Base):
    programa_id: uuid.UUID
    beneficiario_id: uuid.UUID
    imovel_id: uuid.UUID
    tipo_servico_id: uuid.UUID

    descricao: str | None = None
    motivo: str | None = None
    dimensoes_estimadas: str | None = Field(None, max_length=200)
    quantidade_material: str | None = Field(None, max_length=200)
    instrucoes_acesso: str | None = None

    horas_estimadas: float | None = Field(None, ge=0, le=1000)
    maquinas_sugeridas: list[str] = []
    veiculos_sugeridos: list[str] = []

    data_desejada: date | None = None
    prioridade: str = "normal"
    observacoes: str | None = None
    assinatura: AssinaturaEntrada | None = None

    rascunho: bool = False
    justificativa_excecao: str | None = Field(None, max_length=2000)


class SolicitacaoServicoResumo(Base):
    id: uuid.UUID
    protocolo_formatado: str
    situacao: str
    situacao_rotulo: str
    prioridade: str
    produtor: str | None = None
    propriedade: str | None = None
    tipo_servico: str | None = None
    horas_estimadas: float | None = None
    horas_autorizadas: float | None = None
    data_desejada: date | None = None
    data_agendada: date | None = None
    created_at: datetime


class SolicitacaoServicoDetalhe(SolicitacaoServicoResumo):
    ano: int
    programa_id: uuid.UUID
    beneficiario_id: uuid.UUID
    imovel: ImovelResumo | None = None
    pessoa: PessoaResumo | None = None
    descricao: str | None = None
    motivo: str | None = None
    dimensoes_estimadas: str | None = None
    quantidade_material: str | None = None
    instrucoes_acesso: str | None = None
    maquinas_sugeridas: list[str] = []
    veiculos_sugeridos: list[str] = []
    latitude: float | None = None
    longitude: float | None = None
    parecer_tecnico: str | None = None
    motivo_reprovacao: str | None = None
    motivo_cancelamento: str | None = None
    justificativa_excecao: str | None = None
    observacoes: str | None = None
    aprovado_por: str | None = None
    aprovado_em: datetime | None = None
    row_version: int = 1
    saldo_disponivel: float | None = None
    arquivos: list[ArquivoOut] = []
    vistorias: list["VistoriaOut"] = []
    ordens: list[dict] = []
    proximas_situacoes: list[str] = []


class TransicaoEntrada(Base):
    situacao: str
    justificativa: str | None = Field(None, max_length=2000)
    observacoes: str | None = None


class VistoriaEntrada(Base):
    tecnico_id: uuid.UUID | None = None
    data_agendada: date | None = None
    realizada_em: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None

    condicoes_acesso: str | None = None
    medidas_aproximadas: str | None = Field(None, max_length=200)
    tipo_solo: str | None = Field(None, max_length=120)
    riscos: str | None = None
    interferencias: str | None = None
    materiais_necessarios: str | None = None

    maquinas_recomendadas: list[str] = []
    veiculos_recomendados: list[str] = []
    viagens_estimadas: int | None = Field(None, ge=0, le=1000)
    horas_estimadas: float | None = Field(None, ge=0, le=1000)
    combustivel_estimado_litros: float | None = Field(None, ge=0)

    parecer: str | None = None
    favoravel: bool | None = None
    observacoes: str | None = None
    assinatura: AssinaturaEntrada | None = None


class VistoriaOut(VistoriaEntrada):
    id: uuid.UUID
    solicitacao_id: uuid.UUID
    tecnico: str | None = None
    created_at: datetime
    arquivos: list[ArquivoOut] = []
    assinatura: dict | None = None


# ── Ordens de serviço e execução ─────────────────────────────────────────────


class RecursoMaquinaEntrada(Base):
    maquina_id: uuid.UUID
    operador_id: uuid.UUID | None = None
    principal: bool = False
    inicio_previsto: datetime | None = None
    fim_previsto: datetime | None = None
    # Exceção administrativa quando o operador não está habilitado (item 29).
    excecao_habilitacao: str | None = Field(None, max_length=2000)


class RecursoVeiculoEntrada(Base):
    veiculo_id: uuid.UUID
    motorista_id: uuid.UUID | None = None
    inicio_previsto: datetime | None = None
    fim_previsto: datetime | None = None
    excecao_habilitacao: str | None = Field(None, max_length=2000)


class OrdemEntrada(Base):
    solicitacao_id: uuid.UUID
    data_prevista: date
    hora_prevista_inicio: str = Field("07:00", pattern=r"^\d{2}:\d{2}$")
    hora_prevista_fim: str = Field("17:00", pattern=r"^\d{2}:\d{2}$")
    horas_autorizadas: float = Field(..., gt=0, le=1000)
    viagens_previstas: int | None = Field(None, ge=0, le=1000)
    combustivel_previsto_litros: float | None = Field(None, ge=0)
    materiais: str | None = None
    orientacoes: str | None = None

    maquinas: list[RecursoMaquinaEntrada] = []
    veiculos: list[RecursoVeiculoEntrada] = []

    # Gestor confirma conscientemente diante de conflitos contornáveis.
    forcar: bool = False
    justificativa: str | None = Field(None, max_length=2000)


class RecursoOrdemOut(Base):
    id: uuid.UUID
    tipo: str
    recurso_id: uuid.UUID
    recurso_codigo: str | None = None
    recurso_nome: str | None = None
    responsavel_id: uuid.UUID | None = None
    responsavel_nome: str | None = None
    principal: bool = False
    inicio_previsto: datetime
    fim_previsto: datetime
    inicio_real: datetime | None = None
    fim_real: datetime | None = None
    medidor_inicial: float | None = None
    medidor_final: float | None = None
    horas_produtivas: float = 0
    horas_paradas: float = 0
    horas_deslocamento: float = 0
    horas_descontadas: float = 0
    consumo_litros: float = 0
    viagens: int = 0
    ocorrencias: str | None = None
    excecao_habilitacao: str | None = None


class OrdemResumo(Base):
    id: uuid.UUID
    numero_formatado: str
    situacao: str
    situacao_rotulo: str
    data_prevista: date
    hora_prevista_inicio: str | None = None
    protocolo: str | None = None
    produtor: str | None = None
    propriedade: str | None = None
    tipo_servico: str | None = None
    horas_autorizadas: float = 0
    horas_totais: float = 0
    created_at: datetime


class OrdemDetalhe(OrdemResumo):
    ano: int
    solicitacao_id: uuid.UUID
    hora_prevista_fim: str | None = None
    viagens_previstas: int | None = None
    combustivel_previsto_litros: float | None = None
    materiais: str | None = None
    orientacoes: str | None = None
    iniciada_em: datetime | None = None
    concluida_em: datetime | None = None
    horas_produtivas: float = 0
    horas_paradas: float = 0
    horas_deslocamento: float = 0
    horas_descontadas: float = 0
    horas_nao_descontadas: float = 0
    diesel_consumido_litros: float = 0
    viagens_realizadas: int = 0
    servico_realizado: str | None = None
    material_movimentado: str | None = None
    ocorrencias: str | None = None
    avaliacao: int | None = None
    observacoes: str | None = None
    aprovada_por: str | None = None
    motivo_cancelamento: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    endereco: str | None = None
    url_consulta: str | None = None
    row_version: int = 1
    maquinas: list[RecursoOrdemOut] = []
    veiculos: list[RecursoOrdemOut] = []
    apontamentos: list["ApontamentoOut"] = []
    viagens: list["ViagemOut"] = []
    horas_adicionais: list["HorasAdicionaisOut"] = []
    arquivos: list[ArquivoOut] = []


class InicioExecucaoEntrada(Base):
    """Início do serviço no campo (item 33.1)."""

    inicio_em: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None
    horimetro_inicial: float | None = Field(None, ge=0)
    quilometragem_inicial: float | None = Field(None, ge=0)
    maquina_id: uuid.UUID | None = None
    veiculo_id: uuid.UUID | None = None
    condicoes_encontradas: str | None = None
    justificativa_medidor: str | None = None


class PausaEntrada(Base):
    motivo: str = Field(..., min_length=2, max_length=200)
    descricao: str | None = None
    momento: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None


class ApontamentoOut(Base):
    id: uuid.UUID
    tipo: str
    inicio: datetime
    fim: datetime | None = None
    horas: float
    motivo: str | None = None
    descricao: str | None = None
    recurso: str | None = None
    corrigido: bool = False
    justificativa_correcao: str | None = None


class ConclusaoEntrada(Base):
    """Conclusão do serviço (item 33.3)."""

    fim_em: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None
    horimetro_final: float | None = Field(None, ge=0)
    quilometragem_final: float | None = Field(None, ge=0)
    servico_realizado: str | None = None
    material_movimentado: str | None = None
    ocorrencias: str | None = None
    avaliacao: int | None = Field(None, ge=1, le=5)
    observacoes: str | None = None
    # Método administrativo: o gestor informa quantas horas descontar.
    horas_descontar_manual: float | None = Field(None, ge=0, le=1000)
    justificativa_horas: str | None = Field(None, max_length=2000)
    contar_horas_paradas: bool = False
    contar_horas_deslocamento: bool = False
    assinatura_produtor: AssinaturaEntrada | None = None
    assinatura_operador: AssinaturaEntrada | None = None
    justificativa_medidor: str | None = None


class ViagemEntrada(Base):
    veiculo_id: uuid.UUID
    motorista_id: uuid.UUID | None = None
    origem: str | None = Field(None, max_length=200)
    destino: str | None = Field(None, max_length=200)
    material: str | None = Field(None, max_length=200)
    quantidade_estimada_m3: float | None = Field(None, ge=0)
    peso_kg: float | None = Field(None, ge=0)
    km_inicial: float | None = Field(None, ge=0)
    km_final: float | None = Field(None, ge=0)
    saida_em: datetime | None = None
    chegada_em: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None
    observacoes: str | None = None


class ViagemOut(ViagemEntrada):
    id: uuid.UUID
    numero: int
    veiculo_placa: str | None = None
    motorista: str | None = None
    km_percorridos: float | None = None
    created_at: datetime


class HorasAdicionaisEntrada(Base):
    quantidade: float = Field(..., gt=0, le=1000)
    justificativa: str = Field(..., min_length=10, max_length=2000)


class HorasAdicionaisAnalise(Base):
    aprovar: bool
    parecer: str | None = Field(None, max_length=2000)


class HorasAdicionaisOut(Base):
    id: uuid.UUID
    ordem_id: uuid.UUID
    quantidade: float
    justificativa: str
    situacao: str
    solicitante: str | None = None
    analisado_por: str | None = None
    analisado_em: datetime | None = None
    parecer: str | None = None
    saldo_disponivel_no_pedido: float | None = None
    created_at: datetime


SolicitacaoServicoDetalhe.model_rebuild()
OrdemDetalhe.model_rebuild()
