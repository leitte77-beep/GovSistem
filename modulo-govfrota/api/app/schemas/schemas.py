import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.services.placa import normalizar_placa, placa_valida


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Auth motorista ───────────────────────────────────────────────────────────


class LoginMotoristaRequest(BaseModel):
    """Login do motorista — o tenant NUNCA vem do frontend.

    O campo primário é `pin`. `senha` é aceito como alias de compatibilidade
    (fluxos/tests antigos); apenas um deles deve ser informado.
    Campos extras (organization_id, tenant_id, slug, etc.) são ignorados —
    o tenant é sempre resolvido pelo backend a partir da credencial.
    """
    model_config = ConfigDict(extra="ignore")

    login: str = Field(min_length=1, max_length=60)
    pin: str | None = Field(default=None, max_length=60)
    senha: str | None = Field(default=None, max_length=60)

    @model_validator(mode="after")
    def _resolve_pin(self):
        if self.pin is not None and self.senha is not None:
            raise ValueError("Informe apenas um dos campos: pin ou senha.")
        credencial = self.pin if self.pin is not None else self.senha
        if credencial is None or credencial == "":
            raise ValueError("PIN é obrigatório.")
        object.__setattr__(self, "pin", credencial)
        object.__setattr__(self, "senha", None)
        return self


class MotoristaMeResponse(ORMModel):
    id: uuid.UUID
    nome: str
    organization_id: uuid.UUID


class TokenMotoristaResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    motorista: MotoristaMeResponse


# ── Veículos ────────────────────────────────────────────────────────────────


class VeiculoCreate(BaseModel):
    placa: str = Field(min_length=5, max_length=10)
    renavam: Optional[str] = None

    @field_validator("placa")
    @classmethod
    def _validar_placa(cls, v: str) -> str:
        v = normalizar_placa(v)
        if not placa_valida(v):
            raise ValueError(
                "Placa inválida. Use o formato padrão (ABC1234) ou Mercosul (ABC1D23)."
            )
        return v
    chassi: Optional[str] = None
    codigo_interno: Optional[str] = None
    patrimonio: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    versao: Optional[str] = None
    ano_fabricacao: Optional[int] = None
    ano_modelo: Optional[int] = None
    cor: Optional[str] = None
    tipo: str = "CARRO"
    combustivel_principal_id: Optional[uuid.UUID] = None
    combustivel_secundario_id: Optional[uuid.UUID] = None
    capacidade_tanque_litros: Optional[Decimal] = None
    quilometragem_atual: int = 0
    horimetro_atual: Optional[Decimal] = None
    usa_horimetro: bool = False
    unidade: Optional[str] = None
    departamento: Optional[str] = None
    filial: Optional[str] = None
    centro_custo: Optional[str] = None
    situacao: str = "DISPONIVEL"
    observacoes: Optional[str] = None
    vencimento_licenciamento: Optional[date] = None
    vencimento_seguro: Optional[date] = None


class VeiculoUpdate(BaseModel):
    renavam: Optional[str] = None
    chassi: Optional[str] = None
    codigo_interno: Optional[str] = None
    patrimonio: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    versao: Optional[str] = None
    ano_fabricacao: Optional[int] = None
    ano_modelo: Optional[int] = None
    cor: Optional[str] = None
    tipo: Optional[str] = None
    combustivel_principal_id: Optional[uuid.UUID] = None
    combustivel_secundario_id: Optional[uuid.UUID] = None
    capacidade_tanque_litros: Optional[Decimal] = None
    horimetro_atual: Optional[Decimal] = None
    usa_horimetro: Optional[bool] = None
    unidade: Optional[str] = None
    departamento: Optional[str] = None
    filial: Optional[str] = None
    centro_custo: Optional[str] = None
    situacao: Optional[str] = None
    observacoes: Optional[str] = None
    vencimento_licenciamento: Optional[date] = None
    vencimento_seguro: Optional[date] = None
    foto_url: Optional[str] = None


class AlterarKmRequest(BaseModel):
    quilometragem_atual: int = Field(ge=0)
    justificativa: str = Field(min_length=5, max_length=2000)


class VeiculoResponse(ORMModel):
    id: uuid.UUID
    placa: str
    renavam: Optional[str]
    chassi: Optional[str]
    codigo_interno: Optional[str]
    patrimonio: Optional[str]
    marca: Optional[str]
    modelo: Optional[str]
    versao: Optional[str]
    ano_fabricacao: Optional[int]
    ano_modelo: Optional[int]
    cor: Optional[str]
    tipo: str
    combustivel_principal_id: Optional[uuid.UUID]
    combustivel_secundario_id: Optional[uuid.UUID]
    capacidade_tanque_litros: Optional[Decimal]
    quilometragem_atual: int
    horimetro_atual: Optional[Decimal]
    usa_horimetro: bool
    unidade: Optional[str]
    departamento: Optional[str]
    filial: Optional[str]
    centro_custo: Optional[str]
    situacao: str
    observacoes: Optional[str]
    vencimento_licenciamento: Optional[date]
    vencimento_seguro: Optional[date]
    foto_url: Optional[str]
    # Indicadores calculados (§63) — preenchidos apenas na listagem
    consumo_medio_km_l: Optional[Decimal] = None
    ultimo_abastecimento: Optional[dict] = None
    ultima_manutencao: Optional[dict] = None
    proxima_manutencao: Optional[dict] = None


class DocumentoVeiculoCreate(BaseModel):
    descricao: str = Field(min_length=1, max_length=255)
    tipo: Optional[str] = None
    vencimento: Optional[date] = None
    arquivo_url: Optional[str] = None
    anexo_id: Optional[uuid.UUID] = None
    observacoes: Optional[str] = None


class DocumentoVeiculoResponse(ORMModel):
    id: uuid.UUID
    veiculo_id: uuid.UUID
    descricao: str
    tipo: Optional[str]
    vencimento: Optional[date]
    anexo_id: Optional[uuid.UUID]
    observacoes: Optional[str]


# ── Motoristas ──────────────────────────────────────────────────────────────


class MotoristaCreate(BaseModel):
    nome: str = Field(min_length=2, max_length=255)
    cpf: str = Field(min_length=11, max_length=14)
    matricula: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    cnh_numero: Optional[str] = None
    cnh_categoria: Optional[str] = None
    cnh_validade: Optional[date] = None
    observacoes: Optional[str] = None
    foto_url: Optional[str] = None
    ativo: bool = True


class MotoristaUpdate(BaseModel):
    nome: Optional[str] = None
    matricula: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    cnh_numero: Optional[str] = None
    cnh_categoria: Optional[str] = None
    cnh_validade: Optional[date] = None
    observacoes: Optional[str] = None
    foto_url: Optional[str] = None
    ativo: Optional[bool] = None


class CredencialCreate(BaseModel):
    login: str = Field(min_length=3, max_length=60)
    senha: str = Field(min_length=4, max_length=60)


class CredencialUpdate(BaseModel):
    login: Optional[str] = None
    nova_senha: Optional[str] = Field(default=None, min_length=4, max_length=60)


class AcessoResponse(ORMModel):
    login: Optional[str]
    bloqueado: bool
    ultimo_acesso: Optional[datetime]


class MotoristaResponse(ORMModel):
    id: uuid.UUID
    nome: str
    cpf: str
    matricula: Optional[str]
    telefone: Optional[str]
    email: Optional[str]
    cnh_numero: Optional[str]
    cnh_categoria: Optional[str]
    cnh_validade: Optional[date]
    observacoes: Optional[str]
    foto_url: Optional[str] = None
    ativo: bool


class MotoristaListaResponse(MotoristaResponse):
    """Item da listagem com dados de acesso e situação da CNH (evita N+1)."""

    acesso_login: Optional[str] = None
    acesso_bloqueado: bool = False
    ultimo_acesso: Optional[datetime] = None
    situacao_cnh: Optional[str] = None


# ── Combustíveis / tanques ──────────────────────────────────────────────────


class CombustivelCreate(BaseModel):
    nome: str = Field(min_length=1, max_length=100)
    unidade: str = "litro"
    descricao: Optional[str] = None
    foto_url: Optional[str] = None
    ativo: bool = True


class CombustivelResponse(ORMModel):
    id: uuid.UUID
    nome: str
    unidade: str
    descricao: Optional[str]
    foto_url: Optional[str] = None
    ativo: bool
    # Associados (preenchidos na listagem) — evita N+1 no frontend
    total_tanques: int = 0
    total_veiculos: int = 0


class TanqueCreate(BaseModel):
    nome: str = Field(min_length=1, max_length=150)
    codigo: Optional[str] = None
    localizacao: Optional[str] = None
    combustivel_id: uuid.UUID
    capacidade_maxima: Decimal = Field(gt=0)
    estoque_inicial: Decimal = Field(default=Decimal("0"), ge=0)
    estoque_minimo: Decimal = Field(default=Decimal("0"), ge=0)
    observacoes: Optional[str] = None
    foto_url: Optional[str] = None


class TanqueUpdate(BaseModel):
    nome: Optional[str] = None
    codigo: Optional[str] = None
    localizacao: Optional[str] = None
    combustivel_id: Optional[uuid.UUID] = None
    capacidade_maxima: Optional[Decimal] = None
    estoque_minimo: Optional[Decimal] = None
    ativo: Optional[bool] = None
    observacoes: Optional[str] = None
    foto_url: Optional[str] = None


class TanqueResponse(ORMModel):
    id: uuid.UUID
    nome: str
    codigo: Optional[str]
    localizacao: Optional[str]
    combustivel_id: uuid.UUID
    combustivel_nome: Optional[str] = None
    combustivel_unidade: Optional[str] = None
    capacidade_maxima: Decimal
    estoque_inicial: Decimal
    estoque_atual: Decimal
    estoque_minimo: Decimal
    percentual_disponivel: Optional[float] = None
    status_estoque: Optional[str] = None
    foto_url: Optional[str] = None
    ultima_movimentacao: Optional[dict] = None
    ativo: bool
    observacoes: Optional[str]


# ── Fornecedores / oficinas ─────────────────────────────────────────────────


class FornecedorCreate(BaseModel):
    razao_social: str = Field(min_length=1, max_length=255)
    nome_fantasia: Optional[str] = None
    cpf_cnpj: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    site: Optional[str] = None
    contato: Optional[str] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    uf: Optional[str] = None
    endereco: Optional[str] = None
    foto_url: Optional[str] = None
    categoria: str = "COMBUSTIVEL"
    observacoes: Optional[str] = None
    ativo: bool = True


class FornecedorUpdate(BaseModel):
    razao_social: Optional[str] = None
    nome_fantasia: Optional[str] = None
    cpf_cnpj: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    site: Optional[str] = None
    contato: Optional[str] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    uf: Optional[str] = None
    endereco: Optional[str] = None
    foto_url: Optional[str] = None
    categoria: Optional[str] = None
    observacoes: Optional[str] = None
    ativo: Optional[bool] = None


class FornecedorResponse(ORMModel):
    id: uuid.UUID
    razao_social: str
    nome_fantasia: Optional[str]
    cpf_cnpj: Optional[str]
    telefone: Optional[str]
    email: Optional[str]
    site: Optional[str]
    contato: Optional[str]
    cep: Optional[str]
    logradouro: Optional[str]
    numero: Optional[str]
    complemento: Optional[str]
    bairro: Optional[str]
    cidade: Optional[str]
    uf: Optional[str]
    endereco: Optional[str]
    foto_url: Optional[str] = None
    categoria: str
    observacoes: Optional[str]
    ativo: bool
    # Indicadores agregados (preenchidos na listagem/detalhe)
    total_entradas: int = 0
    litros_fornecidos: float = 0
    valor_total: float = 0
    ultima_compra: Optional[dict] = None


class FornecedorDetalheResponse(FornecedorResponse):
    """Ficha do fornecedor: dados + histórico de entradas associadas."""
    historico_entradas: list[dict] = []


class OficinaCreate(BaseModel):
    nome: str = Field(min_length=1, max_length=255)
    razao_social: Optional[str] = None
    cpf_cnpj: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    endereco: Optional[str] = None
    responsavel: Optional[str] = None
    especialidade: Optional[str] = None
    observacoes: Optional[str] = None
    ativo: bool = True


class OficinaUpdate(BaseModel):
    nome: Optional[str] = None
    razao_social: Optional[str] = None
    cpf_cnpj: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    endereco: Optional[str] = None
    responsavel: Optional[str] = None
    especialidade: Optional[str] = None
    observacoes: Optional[str] = None
    ativo: Optional[bool] = None


class OficinaResponse(ORMModel):
    id: uuid.UUID
    nome: str
    razao_social: Optional[str]
    cpf_cnpj: Optional[str]
    telefone: Optional[str]
    email: Optional[str]
    endereco: Optional[str]
    responsavel: Optional[str]
    especialidade: Optional[str]
    observacoes: Optional[str]
    ativo: bool


# ── Entradas de combustível ─────────────────────────────────────────────────


class EntradaCreate(BaseModel):
    tanque_id: uuid.UUID
    combustivel_id: uuid.UUID
    fornecedor_id: Optional[uuid.UUID] = None
    quantidade_litros: Decimal = Field(gt=0)
    data_entrada: date
    numero_nota: Optional[str] = None
    serie_nota: Optional[str] = None
    chave_nfe: Optional[str] = None
    valor_total: Optional[Decimal] = None
    observacoes: Optional[str] = None
    anexo_id: Optional[uuid.UUID] = None
    # Anexos múltiplos (NF PDF/XML/foto). Aceita também o anexo único legado.
    anexos_ids: Optional[list[uuid.UUID]] = None


class EntradaCancelamento(BaseModel):
    justificativa: str = Field(min_length=5, max_length=2000)


class EntradaResponse(ORMModel):
    id: uuid.UUID
    tanque_id: uuid.UUID
    combustivel_id: uuid.UUID
    fornecedor_id: Optional[uuid.UUID]
    quantidade_litros: Decimal
    data_entrada: date
    numero_nota: Optional[str]
    serie_nota: Optional[str]
    chave_nfe: Optional[str]
    valor_total: Optional[Decimal]
    valor_por_litro: Optional[Decimal]
    observacoes: Optional[str]
    cancelada: bool
    cancelada_em: Optional[datetime] = None
    motivo_cancelamento: Optional[str] = None
    responsavel_usuario_id: Optional[uuid.UUID]
    # Nomes juntados (preenchidos na listagem/detalhe) — evita N+1
    tanque_nome: Optional[str] = None
    combustivel_nome: Optional[str] = None
    fornecedor_nome: Optional[str] = None
    # Anexos associados (id, nome, tipo, mime, url)
    anexos: list[dict] = []


# ── Estoque ────────────────────────────────────────────────────────────────


class MovimentacaoResponse(ORMModel):
    id: uuid.UUID
    tipo: str
    origem: str
    sinal: int
    quantidade: Decimal
    combustivel_id: uuid.UUID
    tanque_destino_id: uuid.UUID
    tanque_origem_id: Optional[uuid.UUID]
    referencia_id: Optional[uuid.UUID]
    referencia_tipo: Optional[str]
    descricao: Optional[str]
    custo_unitario: Optional[Decimal]
    saldo_apos: Optional[Decimal]
    responsavel_usuario_id: Optional[uuid.UUID]
    responsavel_motorista_id: Optional[uuid.UUID]
    created_at: datetime
    # Nomes juntados (preenchidos na listagem) — evita N+1
    responsavel_nome: Optional[str] = None
    tanque_destino_nome: Optional[str] = None
    tanque_origem_nome: Optional[str] = None


class AjusteRequest(BaseModel):
    tanque_id: uuid.UUID
    quantidade: Decimal = Field(gt=0)
    positivo: bool
    justificativa: str = Field(min_length=5, max_length=2000)


class TransferenciaRequest(BaseModel):
    tanque_origem_id: uuid.UUID
    tanque_destino_id: uuid.UUID
    quantidade: Decimal = Field(gt=0)
    justificativa: Optional[str] = None


class InventarioCreate(BaseModel):
    tanque_id: uuid.UUID
    estoque_fisico: Decimal = Field(ge=0)
    data_conferencia: date
    observacao: Optional[str] = None


class InventarioConfirmacao(BaseModel):
    justificativa: str = Field(min_length=5, max_length=2000)


class InventarioResponse(ORMModel):
    id: uuid.UUID
    tanque_id: uuid.UUID
    estoque_sistema: Decimal
    estoque_fisico: Decimal
    diferenca: Decimal
    data_conferencia: date
    justificativa: Optional[str]
    ajuste_aplicado: bool
    usuario_id: Optional[uuid.UUID]


class TanqueEvolucaoResponse(BaseModel):
    """Série temporal do saldo de estoque para o gráfico (7/30/90 dias)."""
    periodo_dias: int
    pontos: list[dict]


class TanqueResumoResponse(BaseModel):
    """Indicadores da ficha do tanque — somente dados confiáveis."""
    consumo_medio_diario_litros: Optional[float] = None
    previsao_dias_restantes: Optional[float] = None
    custo_medio_por_litro: Optional[float] = None
    valor_estoque: Optional[float] = None
    autonomia_dias: Optional[float] = None
    ultimos_abastecimentos: list[dict] = []


# ── Abastecimentos ──────────────────────────────────────────────────────────


class AbastecimentoAdminCreate(BaseModel):
    veiculo_id: uuid.UUID
    motorista_id: Optional[uuid.UUID] = None
    tanque_id: uuid.UUID
    combustivel_id: uuid.UUID
    quantidade_litros: Decimal = Field(gt=0)
    quilometragem: int = Field(ge=0)
    completou_tanque: Optional[bool] = None
    data_abastecimento: datetime
    observacoes: Optional[str] = None
    foto_bomba_url: Optional[str] = None
    foto_painel_url: Optional[str] = None
    idempotency_key: Optional[str] = Field(default=None, max_length=64)


class AbastecimentoCancelar(BaseModel):
    justificativa: str = Field(min_length=5, max_length=2000)


class AbastecimentoCorrecao(BaseModel):
    quantidade_litros: Optional[Decimal] = None
    quilometragem: Optional[int] = None
    justificativa: str = Field(min_length=5, max_length=2000)


class AbastecimentoResponse(ORMModel):
    id: uuid.UUID
    veiculo_id: uuid.UUID
    motorista_id: Optional[uuid.UUID]
    tanque_id: uuid.UUID
    combustivel_id: uuid.UUID
    quantidade_litros: Decimal
    quilometragem: int
    completou_tanque: Optional[bool]
    origem: str
    lancado_por_usuario_id: Optional[uuid.UUID]
    data_abastecimento: datetime
    custo_medio_litro: Optional[Decimal]
    custo_total: Optional[Decimal]
    consumo_km_l: Optional[Decimal]
    foto_bomba_url: Optional[str]
    foto_painel_url: Optional[str]
    observacoes: Optional[str]
    status: str
    ip_origem: Optional[str]
    idempotency_key: Optional[str] = None
    # Nomes juntados (preenchidos na listagem) — evita N+1 no frontend
    veiculo_placa: Optional[str] = None
    combustivel_nome: Optional[str] = None
    tanque_nome: Optional[str] = None
    motorista_nome: Optional[str] = None


# ── Manutenções ─────────────────────────────────────────────────────────────


class ManutencaoItemIn(BaseModel):
    categoria: str = "SERVICO"
    descricao: str = Field(min_length=1, max_length=300)
    quantidade: int = 1
    valor_unitario: Decimal = Field(default=Decimal("0"), ge=0)


class ManutencaoCreate(BaseModel):
    veiculo_id: uuid.UUID
    tipo: str = "CORRETIVA"
    descricao_problema: Optional[str] = None
    quilometragem: Optional[int] = None
    data_solicitacao: date
    prioridade: str = "NORMAL"
    oficina_id: Optional[uuid.UUID] = None
    fornecedor_id: Optional[uuid.UUID] = None
    responsavel: Optional[str] = None
    previsao_conclusao: Optional[date] = None
    observacoes: Optional[str] = None
    itens: list[ManutencaoItemIn] = []


class ManutencaoUpdate(BaseModel):
    tipo: Optional[str] = None
    descricao_problema: Optional[str] = None
    quilometragem: Optional[int] = None
    prioridade: Optional[str] = None
    oficina_id: Optional[uuid.UUID] = None
    fornecedor_id: Optional[uuid.UUID] = None
    responsavel: Optional[str] = None
    previsao_conclusao: Optional[date] = None
    data_conclusao: Optional[date] = None
    status: Optional[str] = None
    observacoes: Optional[str] = None


class ManutencaoItemOut(ORMModel):
    id: uuid.UUID
    categoria: str
    descricao: str
    quantidade: int
    valor_unitario: Decimal
    valor_total: Decimal


class ManutencaoResponse(ORMModel):
    id: uuid.UUID
    veiculo_id: uuid.UUID
    tipo: str
    descricao_problema: Optional[str]
    quilometragem: Optional[int]
    data_solicitacao: date
    prioridade: str
    oficina_id: Optional[uuid.UUID]
    fornecedor_id: Optional[uuid.UUID]
    responsavel: Optional[str]
    previsao_conclusao: Optional[date]
    data_conclusao: Optional[date]
    valor_total: Decimal
    status: str
    observacoes: Optional[str]
    itens: list[ManutencaoItemOut] = []


class PlanoPreventivoCreate(BaseModel):
    veiculo_id: uuid.UUID
    nome: str = Field(min_length=1, max_length=150)
    base: str
    intervalo_km: Optional[int] = None
    intervalo_horimetro: Optional[Decimal] = None
    intervalo_meses: Optional[int] = None
    ultima_execucao_km: Optional[int] = None
    ultima_execucao_horimetro: Optional[Decimal] = None
    ultima_execucao_data: Optional[date] = None
    observacoes: Optional[str] = None


class PlanoPreventivoResponse(ORMModel):
    id: uuid.UUID
    veiculo_id: uuid.UUID
    nome: str
    base: str
    intervalo_km: Optional[int]
    intervalo_horimetro: Optional[Decimal]
    intervalo_meses: Optional[int]
    ativo: bool
    ultima_execucao_km: Optional[int]
    ultima_execucao_data: Optional[date]
    proxima_execucao_km: Optional[int] = None
    proxima_execucao_data: Optional[date] = None
    situacao_alerta: Optional[str] = None


# ── Ocorrências ─────────────────────────────────────────────────────────────


class OcorrenciaCreate(BaseModel):
    veiculo_id: uuid.UUID
    motorista_id: Optional[uuid.UUID] = None
    categoria: str
    descricao: str = Field(min_length=3, max_length=5000)
    quilometragem: Optional[int] = None
    gravidade: str = "MEDIA"
    data_ocorrencia: Optional[date] = None
    foto_url: Optional[str] = None
    origem: str = "ADMIN"


class OcorrenciaUpdate(BaseModel):
    status: Optional[str] = None
    gravidade: Optional[str] = None
    descricao: Optional[str] = None


class OcorrenciaResponse(ORMModel):
    id: uuid.UUID
    veiculo_id: uuid.UUID
    motorista_id: Optional[uuid.UUID]
    categoria: str
    descricao: str
    quilometragem: Optional[int]
    gravidade: str
    status: str
    foto_url: Optional[str]
    data_ocorrencia: date
    manutencao_id: Optional[uuid.UUID]
    origem: str


# ── Configurações ───────────────────────────────────────────────────────────


class ConfiguracaoUpdate(BaseModel):
    tipo_organizacao: Optional[str] = None
    nome_modulo: Optional[str] = None
    foto_obrigatoria: Optional[bool] = None
    foto_bomba_obrigatoria: Optional[bool] = None
    foto_km_obrigatoria: Optional[bool] = None
    exigir_tanque_cheio: Optional[bool] = None
    permitir_retroativo: Optional[bool] = None
    tolerancia_km_percentual: Optional[int] = None
    alerta_consumo_desvio_pct: Optional[int] = None
    bloquear_cnh_vencida: Optional[bool] = None
    permitir_estoque_negativo: Optional[bool] = None
    exigir_nf_entrada: Optional[bool] = None
    exigir_fornecedor_entrada: Optional[bool] = None
    antecedencia_alerta_manutencao_dias: Optional[int] = None


class ConfiguracaoResponse(ConfiguracaoUpdate):
    pass


# ── App do motorista ────────────────────────────────────────────────────────


class VeiculoAppResponse(BaseModel):
    id: uuid.UUID
    placa: str
    modelo: Optional[str]
    marca: Optional[str]
    foto_url: Optional[str]
    usa_horimetro: bool
    combustivel_principal_id: Optional[uuid.UUID]
    combustivel_principal_nome: Optional[str] = None
    combustivel_secundario_id: Optional[uuid.UUID] = None
    combustivel_secundario_nome: Optional[str] = None
    quilometragem_atual: int = 0
    horimetro_atual: Optional[Decimal] = None


class OcorrenciaAppCreate(BaseModel):
    veiculo_id: uuid.UUID
    categoria: str
    descricao: str = Field(min_length=3, max_length=5000)
    gravidade: str = "MEDIA"
    quilometragem: Optional[int] = None
    foto_url: Optional[str] = None


# ── Auditoria / notificações ────────────────────────────────────────────────


class AuditoriaResponse(ORMModel):
    id: uuid.UUID
    usuario_id: Optional[uuid.UUID]
    motorista_id: Optional[uuid.UUID]
    acao: str
    entidade: str
    entidade_id: Optional[uuid.UUID]
    dados_anteriores: Optional[str]
    dados_novos: Optional[str]
    justificativa: Optional[str]
    ip_address: Optional[str]
    created_at: datetime


class NotificacaoResponse(ORMModel):
    id: uuid.UUID
    tipo: str
    titulo: str
    descricao: Optional[str]
    severidade: str
    link: Optional[str]
    lida: bool
    created_at: datetime
