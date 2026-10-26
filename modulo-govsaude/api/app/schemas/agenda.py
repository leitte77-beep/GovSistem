"""DTOs da Fase 4: agenda, recepção, fila e painéis (B.6-001…047, B.3-008, B.12-018)."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SEXOS_VALIDOS = {"MASCULINO", "FEMININO", "INTERSEXO", "NAO_INFORMADO", "OUTRO"}


def _validar_sexos(valores: list[str] | None) -> list[str] | None:
    if valores is None:
        return None
    normalizados = [str(valor).strip().upper() for valor in valores]
    invalidos = sorted(set(normalizados) - SEXOS_VALIDOS)
    if invalidos:
        raise ValueError(f"Sexos inválidos: {', '.join(invalidos)}.")
    return normalizados


class NivelRiscoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    codigo: str = Field(min_length=1, max_length=40)
    rotulo: str = Field(min_length=2, max_length=120)
    cor: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$", description="Cor hexadecimal (#RRGGBB).")
    ordem: int = Field(ge=0)
    prioridade_legal: bool = False
    tempo_alvo_minutos: int | None = Field(default=None, ge=0)
    observacoes: str | None = Field(default=None, max_length=2000)
    ativo: bool = True


class NivelRiscoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    protocolo_id: uuid.UUID
    codigo: str
    rotulo: str
    cor: str
    ordem: int
    prioridade_legal: bool
    tempo_alvo_minutos: int | None = None
    observacoes: str | None = None
    ativo: bool


class ProtocoloRiscoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    estabelecimento_id: uuid.UUID
    nome: str = Field(min_length=2, max_length=160)
    versao_protocolo: str = Field(default="1", min_length=1, max_length=40)
    descricao: str | None = Field(default=None, max_length=4000)
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    niveis: list[NivelRiscoCreate] = Field(min_length=1)


class ProtocoloRiscoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str | None = Field(default=None, min_length=2, max_length=160)
    versao_protocolo: str | None = Field(default=None, min_length=1, max_length=40)
    descricao: str | None = Field(default=None, max_length=4000)
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    ativo: bool | None = None
    niveis: list[NivelRiscoCreate] | None = Field(default=None, min_length=1)


class ProtocoloRiscoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    nome: str
    versao_protocolo: str
    descricao: str | None = None
    vigencia_inicio: date
    vigencia_fim: date | None = None
    ativo: bool
    versao: int
    baixa_em: datetime | None = None
    baixa_motivo: str | None = None
    niveis: list[NivelRiscoOut] = Field(default_factory=list)


class AgendaHorarioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dia_semana: int = Field(ge=0, le=6, description="0=segunda ... 6=domingo")
    hora_inicio: time
    hora_fim: time
    duracao_minutos: int = Field(default=30, ge=5, le=480)
    vagas_por_horario: int = Field(default=1, ge=1, le=200)
    ativo: bool = True

    @field_validator("hora_fim")
    @classmethod
    def _fim_maior(cls, valor: time, info):
        inicio = info.data.get("hora_inicio")
        if inicio is not None and valor <= inicio:
            raise ValueError("hora_fim deve ser maior que hora_inicio.")
        return valor


class AgendaHorarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agenda_id: uuid.UUID
    dia_semana: int
    hora_inicio: time
    hora_fim: time
    duracao_minutos: int
    vagas_por_horario: int
    ativo: bool


class AgendaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    estabelecimento_id: uuid.UUID
    setor_id: uuid.UUID | None = None
    equipe_id: uuid.UUID | None = None
    profissional_id: uuid.UUID | None = None
    especialidade_id: uuid.UUID | None = None
    protocolo_risco_id: uuid.UUID | None = None
    prioridade_padrao_id: uuid.UUID | None = None
    procedimento_sigtap: str | None = Field(default=None, pattern=r"^\d{10}$")
    nome: str = Field(min_length=2, max_length=160)
    tipo: Literal[
        "CONSULTA",
        "PROCEDIMENTO",
        "RETORNO",
        "ODONTOLOGIA",
        "VACINACAO",
        "ACOLHIMENTO",
        "OUTRO",
    ]
    modalidade: Literal["PRESENCIAL", "DOMICILIAR", "COLETIVA"] = "PRESENCIAL"
    permite_encaixe: bool = False
    falta_automatica: bool = True
    tolerancia_atraso_minutos: int = Field(default=30, ge=0, le=1440)
    antecedencia_minima_horas: int = Field(default=0, ge=0, le=8760)
    antecedencia_maxima_dias: int = Field(default=365, ge=0, le=3650)
    idade_minima: int | None = Field(default=None, ge=0, le=130)
    idade_maxima: int | None = Field(default=None, ge=0, le=130)
    sexos_permitidos: list[str] | None = None
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    observacoes: str | None = Field(default=None, max_length=4000)
    horarios: list[AgendaHorarioCreate] = Field(min_length=1)

    @field_validator("sexos_permitidos")
    @classmethod
    def _sexos(cls, valor):
        return _validar_sexos(valor)

    @field_validator("idade_maxima")
    @classmethod
    def _idade(cls, valor, info):
        minima = info.data.get("idade_minima")
        if valor is not None and minima is not None and valor < minima:
            raise ValueError("idade_maxima deve ser maior ou igual a idade_minima.")
        return valor


class AgendaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    setor_id: uuid.UUID | None = None
    equipe_id: uuid.UUID | None = None
    profissional_id: uuid.UUID | None = None
    especialidade_id: uuid.UUID | None = None
    protocolo_risco_id: uuid.UUID | None = None
    prioridade_padrao_id: uuid.UUID | None = None
    procedimento_sigtap: str | None = Field(default=None, pattern=r"^\d{10}$")
    nome: str | None = Field(default=None, min_length=2, max_length=160)
    tipo: Literal[
        "CONSULTA",
        "PROCEDIMENTO",
        "RETORNO",
        "ODONTOLOGIA",
        "VACINACAO",
        "ACOLHIMENTO",
        "OUTRO",
    ] | None = None
    modalidade: Literal["PRESENCIAL", "DOMICILIAR", "COLETIVA"] | None = None
    permite_encaixe: bool | None = None
    falta_automatica: bool | None = None
    tolerancia_atraso_minutos: int | None = Field(default=None, ge=0, le=1440)
    antecedencia_minima_horas: int | None = Field(default=None, ge=0, le=8760)
    antecedencia_maxima_dias: int | None = Field(default=None, ge=0, le=3650)
    idade_minima: int | None = Field(default=None, ge=0, le=130)
    idade_maxima: int | None = Field(default=None, ge=0, le=130)
    sexos_permitidos: list[str] | None = None
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    observacoes: str | None = Field(default=None, max_length=4000)
    ativo: bool | None = None
    horarios: list[AgendaHorarioCreate] | None = Field(default=None, min_length=1)

    @field_validator("sexos_permitidos")
    @classmethod
    def _sexos(cls, valor):
        return _validar_sexos(valor)


class AgendaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    setor_id: uuid.UUID | None = None
    equipe_id: uuid.UUID | None = None
    profissional_id: uuid.UUID | None = None
    especialidade_id: uuid.UUID | None = None
    protocolo_risco_id: uuid.UUID | None = None
    prioridade_padrao_id: uuid.UUID | None = None
    procedimento_sigtap: str | None = None
    nome: str
    tipo: str
    modalidade: str
    permite_encaixe: bool
    falta_automatica: bool
    tolerancia_atraso_minutos: int
    antecedencia_minima_horas: int
    antecedencia_maxima_dias: int
    idade_minima: int | None = None
    idade_maxima: int | None = None
    sexos_permitidos: list[str] | None = None
    vigencia_inicio: date
    vigencia_fim: date | None = None
    observacoes: str | None = None
    ativo: bool
    versao: int
    baixa_em: datetime | None = None
    baixa_motivo: str | None = None
    horarios: list[AgendaHorarioOut] = Field(default_factory=list)


class AgendaBloqueioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    inicio_em: datetime
    fim_em: datetime
    tipo: Literal["BLOQUEIO", "FERIADO", "MANUTENCAO", "AUSENCIA", "OUTRO"] = "BLOQUEIO"
    motivo: str = Field(min_length=10, max_length=400)

    @field_validator("fim_em")
    @classmethod
    def _fim_maior(cls, valor: datetime, info):
        inicio = info.data.get("inicio_em")
        if inicio is not None and valor <= inicio:
            raise ValueError("fim_em deve ser maior que inicio_em.")
        return valor


class AgendaBloqueioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    agenda_id: uuid.UUID
    inicio_em: datetime
    fim_em: datetime
    tipo: str
    motivo: str
    criado_por_id: uuid.UUID | None = None
    cancelado_em: datetime | None = None
    cancelado_motivo: str | None = None
    versao: int


class BloqueioCancelamento(BaseModel):
    model_config = ConfigDict(extra="forbid")

    motivo: str = Field(min_length=10, max_length=400)


class DisponibilidadeSlotOut(BaseModel):
    inicio_em: datetime
    fim_em: datetime
    inicio_local: str
    fim_local: str
    ocupadas: int
    vagas: int
    disponivel: bool
    bloqueado: bool = False
    motivo: str | None = None


class DisponibilidadeDiaOut(BaseModel):
    data: date
    dia_semana: int
    slots: list[DisponibilidadeSlotOut] = Field(default_factory=list)


class DisponibilidadeOut(BaseModel):
    agenda_id: uuid.UUID
    fuso_horario: str
    data_inicio: date
    data_fim: date
    dias: list[DisponibilidadeDiaOut] = Field(default_factory=list)


class AgendamentoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    agenda_id: uuid.UUID
    cidadao_id: uuid.UUID
    inicio_em: datetime
    prioridade_id: uuid.UUID | None = None
    protocolo_risco_id: uuid.UUID | None = None
    nivel_risco_id: uuid.UUID | None = None
    procedimento_sigtap: str | None = Field(default=None, pattern=r"^\d{10}$")
    origem: Literal[
        "RECEPCAO", "APP", "WEB", "TELEFONE", "PRESENCIAL", "IMPORTACAO", "OUTRO"
    ] = "RECEPCAO"
    id_cliente: uuid.UUID | None = None
    encaixe: bool = False
    forcar_incompatibilidade: bool = False
    justificativa_excecao: str | None = Field(default=None, max_length=2000)
    observacoes: str | None = Field(default=None, max_length=4000)


class AgendamentoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prioridade_id: uuid.UUID | None = None
    protocolo_risco_id: uuid.UUID | None = None
    nivel_risco_id: uuid.UUID | None = None
    procedimento_sigtap: str | None = Field(default=None, pattern=r"^\d{10}$")
    observacoes: str | None = Field(default=None, max_length=4000)


class AgendamentoReagendar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    inicio_em: datetime
    motivo: str = Field(min_length=10, max_length=400)
    encaixe: bool = False
    justificativa_excecao: str | None = Field(default=None, max_length=2000)


class AgendamentoCancelar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    motivo: str = Field(min_length=10, max_length=400)


class AgendamentoFalta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    motivo: str = Field(min_length=10, max_length=400)


class AgendamentoReverterFalta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    justificativa: str = Field(min_length=20, max_length=2000)


class AlertaOut(BaseModel):
    codigo: str
    mensagem: str
    bloqueante: bool = False


class AgendamentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    agenda_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    setor_id: uuid.UUID | None = None
    profissional_id: uuid.UUID | None = None
    especialidade_id: uuid.UUID | None = None
    cidadao_id: uuid.UUID
    prioridade_id: uuid.UUID | None = None
    protocolo_risco_id: uuid.UUID | None = None
    nivel_risco_id: uuid.UUID | None = None
    procedimento_sigtap: str | None = None
    inicio_em: datetime
    fim_em: datetime
    situacao: str
    origem: str
    encaixe: bool
    excecao_justificada: bool
    justificativa_excecao: str | None = None
    observacoes: str | None = None
    id_cliente: uuid.UUID | None = None
    confirmado_em: datetime | None = None
    recepcionado_em: datetime | None = None
    iniciado_em: datetime | None = None
    concluido_em: datetime | None = None
    cancelado_em: datetime | None = None
    motivo_cancelamento: str | None = None
    falta_em: datetime | None = None
    falta_automatica: bool
    falta_revertida_em: datetime | None = None
    justificativa_reversao: str | None = None
    reagendado_de_id: uuid.UUID | None = None
    versao: int
    agenda_nome: str | None = None
    cidadao_nome_exibicao: str | None = None
    cidadao_nome_abreviado: str | None = None
    alertas: list[AlertaOut] = Field(default_factory=list)
    codigo_acesso: str | None = Field(
        default=None, description="Token do QR/código de barras, exibido apenas na criação."
    )


class AgendamentoComprovanteOut(BaseModel):
    agendamento_id: uuid.UUID
    codigo_acesso: str
    codigo_barras: str
    texto: str


class FilaEntradaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    estabelecimento_id: uuid.UUID
    setor_id: uuid.UUID
    cidadao_id: uuid.UUID
    agendamento_id: uuid.UUID | None = None
    prioridade_id: uuid.UUID | None = None
    protocolo_risco_id: uuid.UUID | None = None
    nivel_risco_id: uuid.UUID | None = None
    origem: Literal["AGENDAMENTO", "DEMANDA_ESPONTANEA", "RETORNO", "ENCAIXE"] = (
        "DEMANDA_ESPONTANEA"
    )
    observacoes: str | None = Field(default=None, max_length=4000)


class FilaClassificacaoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prioridade_id: uuid.UUID | None = None
    protocolo_risco_id: uuid.UUID | None = None
    nivel_risco_id: uuid.UUID | None = None
    observacoes: str | None = Field(default=None, max_length=4000)


class FilaTemposOut(BaseModel):
    espera_minutos: int | None = None
    triagem_minutos: int | None = None
    espera_atendimento_minutos: int | None = None
    atendimento_minutos: int | None = None
    total_minutos: int | None = None
    tempo_alvo_minutos: int | None = None
    dentro_do_tempo_alvo: bool | None = None


class FilaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    setor_id: uuid.UUID
    cidadao_id: uuid.UUID
    agendamento_id: uuid.UUID | None = None
    prioridade_id: uuid.UUID | None = None
    protocolo_risco_id: uuid.UUID | None = None
    nivel_risco_id: uuid.UUID | None = None
    origem: str
    situacao: str
    entrada_em: datetime
    chamado_em: datetime | None = None
    ultima_chamada_em: datetime | None = None
    chamadas: int
    triagem_inicio_em: datetime | None = None
    triagem_fim_em: datetime | None = None
    atendimento_inicio_em: datetime | None = None
    atendimento_fim_em: datetime | None = None
    evadido_em: datetime | None = None
    nome_abreviado: str
    nivel_ordem: int
    prioridade_ordem: int
    prioridade_legal: bool
    observacoes: str | None = None
    versao: int
    posicao: int | None = None
    cidadao_nome_exibicao: str | None = None
    prioridade_rotulo: str | None = None
    nivel_risco_rotulo: str | None = None
    nivel_risco_cor: str | None = None
    tempos: FilaTemposOut = Field(default_factory=FilaTemposOut)
    ordem_ranking: list[dict] = Field(default_factory=list)


class FilaListaOut(BaseModel):
    estabelecimento_id: uuid.UUID
    setor_id: uuid.UUID
    situacao: list[str]
    regra_ordenacao: list[dict]
    itens: list[FilaOut]
    total_estimado: int
    gerado_em: datetime


class FilaChamarRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    destino: str = Field(min_length=1, max_length=120)
    tipo: Literal["NORMAL", "PREFERENCIAL", "RECHAMADA"] = "NORMAL"
    painel_id: uuid.UUID | None = None


class ChamadaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    painel_id: uuid.UUID | None = None
    fila_id: uuid.UUID
    tipo: str
    destino: str
    nome_abreviado: str
    texto_chamada: str
    texto_voz: str
    chamado_por_id: uuid.UUID | None = None
    chamado_em: datetime


class FilaFinalizarRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    observacoes: str | None = Field(default=None, max_length=4000)


class FilaCancelarRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    motivo: str = Field(min_length=10, max_length=400)


class FilaEventoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    fila_id: uuid.UUID
    tipo: str
    dados: dict | None = None
    usuario_id: uuid.UUID | None = None
    created_at: datetime


class PainelChamadaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    estabelecimento_id: uuid.UUID
    setor_id: uuid.UUID
    nome: str = Field(min_length=2, max_length=160)
    nome_abreviado: bool = True
    voz_habilitada: bool = True
    mensagem_rodape: str | None = Field(default=None, max_length=300)
    noticias: list[dict] | None = None


class PainelChamadaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str | None = Field(default=None, min_length=2, max_length=160)
    nome_abreviado: bool | None = None
    voz_habilitada: bool | None = None
    mensagem_rodape: str | None = Field(default=None, max_length=300)
    noticias: list[dict] | None = None
    ativo: bool | None = None


class PainelChamadaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    setor_id: uuid.UUID
    nome: str
    ativo: bool
    nome_abreviado: bool
    voz_habilitada: bool
    mensagem_rodape: str | None = None
    noticias: list[dict] | None = None
    ultima_chamada_em: datetime | None = None
    versao: int
    baixa_em: datetime | None = None


class PainelEstadoOut(BaseModel):
    painel: PainelChamadaOut
    ultimas_chamadas: list[ChamadaOut]
    aguardando: int
    regra_ordenacao: list[dict]


class CheckInRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    estabelecimento_id: uuid.UUID
    setor_id: uuid.UUID | None = None
    metodo: Literal["CODIGO_BARRAS", "QR_CODE", "BIOMETRIA", "MANUAL"] = "CODIGO_BARRAS"
    codigo: str | None = Field(default=None, max_length=300)
    cidadao_id: uuid.UUID | None = None
    agendamento_id: uuid.UUID | None = None
    biometria_token: str | None = Field(default=None, max_length=2000)
    prioridade_id: uuid.UUID | None = None
    protocolo_risco_id: uuid.UUID | None = None
    nivel_risco_id: uuid.UUID | None = None
    observacoes: str | None = Field(default=None, max_length=4000)


class CheckInOut(BaseModel):
    metodo: str
    cidadao_id: uuid.UUID
    nome_abreviado: str
    agendamento_id: uuid.UUID | None = None
    fila_id: uuid.UUID | None = None
    situacao_agendamento: str | None = None
    situacao_fila: str | None = None
    posicao: int | None = None
    alertas: list[AlertaOut] = Field(default_factory=list)
    alternativas_identificacao: list[str] = Field(default_factory=list)


class DemandaEspontaneaRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    estabelecimento_id: uuid.UUID
    setor_id: uuid.UUID
    cidadao_id: uuid.UUID
    prioridade_id: uuid.UUID | None = None
    protocolo_risco_id: uuid.UUID | None = None
    nivel_risco_id: uuid.UUID | None = None
    origem: Literal["DEMANDA_ESPONTANEA", "RETORNO", "ENCAIXE"] = "DEMANDA_ESPONTANEA"
    observacoes: str | None = Field(default=None, max_length=4000)


class CartaoCidadaoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cidadao_id: uuid.UUID


class CartaoCidadaoOut(BaseModel):
    cidadao_id: uuid.UUID
    codigo_acesso: str
    codigo_barras: str
    formato: str
    instrucoes: str
