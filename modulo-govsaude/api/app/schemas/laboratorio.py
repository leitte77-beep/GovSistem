"""Contratos da Fase 10 — laboratório e SISCAN (B.8, B.5)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

TIPOS_SISCAN = Literal["CITO_COLO", "HISTO_COLO", "MAMOGRAFIA", "CITO_MAMA", "HISTO_MAMA"]


class CampoResultado(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codigo: str = Field(min_length=1, max_length=40)
    nome: str = Field(min_length=1, max_length=120)
    tipo: Literal["NUMERICO", "TEXTO", "OPCAO"] = "NUMERICO"
    unidade: str | None = Field(default=None, max_length=30)
    referencia_min: float | None = None
    referencia_max: float | None = None
    critico_min: float | None = None
    critico_max: float | None = None
    limite_min: float | None = None
    limite_max: float | None = None
    opcoes: list[str] | None = None
    obrigatorio: bool = True

    @model_validator(mode="after")
    def _coerente(self):
        if self.tipo == "OPCAO" and not self.opcoes:
            raise ValueError(f"Campo {self.codigo}: OPCAO exige opcoes.")
        pares = [
            (self.referencia_min, self.referencia_max),
            (self.critico_min, self.critico_max),
            (self.limite_min, self.limite_max),
        ]
        if any(a is not None and b is not None and a > b for a, b in pares):
            raise ValueError(f"Campo {self.codigo}: mínimo maior que máximo.")
        return self


class ExameCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codigo: str = Field(min_length=1, max_length=30)
    nome: str = Field(min_length=2, max_length=240)
    tipo: Literal["LABORATORIO", "RADIOLOGIA"] = "LABORATORIO"
    estabelecimento_id: uuid.UUID | None = None
    metodo: str | None = Field(default=None, max_length=120)
    material: str | None = Field(default=None, max_length=80)
    bancada: str | None = Field(default=None, max_length=80)
    campos: list[CampoResultado] = Field(default_factory=list, max_length=200)
    layout_laudo: str | None = Field(default=None, max_length=20000)
    procedimento_sigtap: str | None = Field(default=None, pattern=r"^\d{10}$")
    cids: list[str] | None = None
    regras_faturamento: dict | None = None
    valor_unitario: float | None = Field(default=None, ge=0)
    exige_autorizacao: bool = False
    alto_custo: bool = False
    carencia_dias: int | None = Field(default=None, ge=1, le=3650)
    validade_autorizacao_dias: int | None = Field(default=None, ge=1, le=3650)
    validade_resultado_dias: int | None = Field(default=None, ge=1, le=3650)
    prazo_entrega_dias: int | None = Field(default=None, ge=0, le=365)
    sigiloso: bool = False
    estabelecimentos_requisitantes: list[uuid.UUID] | None = None
    cbos_liberacao: list[str] | None = None
    integrado_equipamento: bool = False
    equipamento_codigo: str | None = Field(default=None, max_length=60)

    @model_validator(mode="after")
    def _consistencia(self):
        codigos = [c.codigo for c in self.campos]
        if len(set(codigos)) != len(codigos):
            raise ValueError("Códigos de campo devem ser únicos.")
        if self.tipo == "LABORATORIO" and not self.campos:
            raise ValueError("Exame laboratorial exige ao menos um campo de resultado.")
        if self.integrado_equipamento and not self.equipamento_codigo:
            raise ValueError("Exame integrado exige equipamento_codigo.")
        return self


class ExameOut(ExameCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    numero_versao: int
    ativo: bool
    copiado_de_id: uuid.UUID | None = None
    versao: int


class CopiarExame(BaseModel):
    model_config = ConfigDict(extra="forbid")
    estabelecimento_id: uuid.UUID


class RequisicaoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cidadao_id: uuid.UUID
    estabelecimento_origem_id: uuid.UUID
    estabelecimento_coleta_id: uuid.UUID | None = None
    exames: list[uuid.UUID] = Field(min_length=1, max_length=60)
    origem: Literal["PRONTUARIO", "AGENDA", "AVULSA"] = "AVULSA"
    atendimento_id: uuid.UUID | None = None
    agendamento_id: uuid.UUID | None = None
    profissional_solicitante_id: uuid.UUID | None = None
    solicitante_externo: str | None = Field(default=None, max_length=200)
    urgente: bool = False
    gestante: bool = False
    observacoes: str | None = Field(default=None, max_length=4000)
    justificativa: str | None = Field(default=None, max_length=2000)
    id_cliente: str | None = Field(default=None, max_length=80)
    contingencia: bool = False
    registrada_em: datetime | None = None

    @model_validator(mode="after")
    def _origem(self):
        if self.origem == "PRONTUARIO" and not self.atendimento_id:
            raise ValueError("Origem PRONTUARIO exige atendimento_id.")
        if self.origem == "AGENDA" and not self.agendamento_id:
            raise ValueError("Origem AGENDA exige agendamento_id.")
        if self.contingencia and not self.id_cliente:
            raise ValueError("Registro de contingência exige id_cliente.")
        return self


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    requisicao_id: uuid.UUID
    exame_id: uuid.UUID
    exame_codigo: str
    etiqueta: str
    situacao: str
    sigiloso: bool
    autorizacao_situacao: str | None = None
    autorizacao_valida_ate: date | None = None
    alertas: list | None = None
    material: str | None = None
    coletado_em: datetime | None = None
    valores: dict | None = None
    texto_livre: str | None = None
    anexos: list | None = None
    avaliacao: list | None = None
    incompleto: bool
    fora_referencia: bool
    critico: bool
    resultado_em: datetime | None = None
    resultado_versao: int
    liberado_em: datetime | None = None
    liberado_por_id: uuid.UUID | None = None
    assinatura_hash: str | None = None
    entregue_em: datetime | None = None
    entregue_a: str | None = None
    velado: bool = False


class RequisicaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    protocolo: str
    cidadao_id: uuid.UUID
    estabelecimento_origem_id: uuid.UUID
    estabelecimento_coleta_id: uuid.UUID
    origem: str
    urgente: bool
    gestante: bool
    observacoes: str | None = None
    contingencia: bool
    recebida_em: datetime | None = None
    previsao_retirada: date | None = None
    itens: list[ItemOut] = []
    codigo_acesso: str | None = None
    duplicada: bool = False


class Recepcao(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codigo: str = Field(min_length=4, max_length=40, description="Protocolo, etiqueta ou QR")


class Coleta(BaseModel):
    model_config = ConfigDict(extra="forbid")
    etiqueta: str = Field(min_length=4, max_length=30)
    material: str = Field(min_length=1, max_length=80)
    coletado_em: datetime | None = None


class Autorizacao(BaseModel):
    model_config = ConfigDict(extra="forbid")
    autorizado: bool
    motivo: str | None = Field(default=None, max_length=2000)


class Problema(BaseModel):
    model_config = ConfigDict(extra="forbid")
    categoria: Literal["COLETA", "AMOSTRA", "TRANSPORTE", "PROCESSAMENTO"]
    motivo: str = Field(min_length=5, max_length=2000)
    nova_coleta: bool = False


class Etapa(BaseModel):
    model_config = ConfigDict(extra="forbid")
    etapa: Literal["EM_PROCESSAMENTO"]


class ResultadoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    valores: dict[str, float | str] = Field(default_factory=dict)
    texto_livre: str | None = Field(default=None, max_length=50000)
    anexos: list[uuid.UUID] | None = None
    parcial: bool = False
    motivo_alteracao: str | None = Field(default=None, max_length=2000)
    id_cliente: str | None = Field(default=None, max_length=80)


class Liberacao(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assinatura: Literal["ELETRONICA", "DIGITAL"] = "ELETRONICA"


class Entrega(BaseModel):
    model_config = ConfigDict(extra="forbid")
    recebedor: str = Field(min_length=3, max_length=200)
    documento: str = Field(min_length=3, max_length=40)
    parentesco: str | None = Field(default=None, max_length=60)


class Motivo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    motivo: str = Field(min_length=5, max_length=2000)


class MensagemEquipamentoIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    equipamento: str = Field(min_length=1, max_length=60)
    id_mensagem: str = Field(min_length=1, max_length=80)
    etiqueta: str = Field(min_length=1, max_length=30)
    valores: dict[str, float | str]


class PortalLaudo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    protocolo: str = Field(min_length=4, max_length=20)
    codigo_acesso: str = Field(min_length=6, max_length=20)
    data_nascimento: date


class LoteContingencia(BaseModel):
    model_config = ConfigDict(extra="forbid")
    requisicoes: list[RequisicaoCreate] = Field(min_length=1, max_length=200)


# ── SISCAN ──────────────────────────────────────────────────────────────────
class CampoModelo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codigo: str = Field(min_length=1, max_length=60)
    nome: str = Field(min_length=1, max_length=200)
    tipo: Literal["TEXTO", "NUMERICO", "DATA", "OPCAO", "BOOLEANO"] = "TEXTO"
    opcoes: list[str] | None = None
    obrigatorio: bool = False


class ModeloSiscanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tipo: TIPOS_SISCAN
    nome: str = Field(min_length=2, max_length=200)
    fonte_normativa: str | None = Field(default=None, max_length=2000)
    campos_requisicao: list[CampoModelo] = Field(min_length=1, max_length=300)
    campos_resultado: list[CampoModelo] = Field(min_length=1, max_length=300)
    valores_alterados: dict[str, list[str]] | None = None
    procedimento_coleta_sigtap: str | None = Field(default=None, pattern=r"^\d{10}$")
    prazo_resultado_dias: int | None = Field(default=None, ge=1, le=365)
    intervalo_rastreamento_meses: int | None = Field(default=None, ge=1, le=120)


class ModeloSiscanOut(ModeloSiscanCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    numero_versao: int
    ativo: bool


class AtivacaoModelo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fonte_normativa: str | None = Field(default=None, max_length=2000)


class SiscanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tipo: TIPOS_SISCAN
    cidadao_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    profissional_id: uuid.UUID | None = None
    especialidade: str | None = Field(default=None, max_length=120)
    material: str | None = Field(default=None, max_length=80)
    coletado_em: datetime | None = None
    informacoes_clinicas: str | None = Field(default=None, max_length=8000)
    dados: dict = Field(default_factory=dict)


class SiscanResultado(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dados: dict
    prestador: str | None = Field(default=None, max_length=200)
    proximo_exame_em: date | None = None


class SiscanSituacao(BaseModel):
    model_config = ConfigDict(extra="forbid")
    situacao: Literal["COLETADO", "ENVIADO", "COMUNICADO", "EM_SEGUIMENTO", "ENCERRADO"]
    coletado_em: datetime | None = None
    prestador: str | None = Field(default=None, max_length=200)
    meio: str | None = Field(default=None, max_length=40)
    seguimento: str | None = Field(default=None, max_length=4000)
    proximo_exame_em: date | None = None


class SiscanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    tipo: str
    modelo_id: uuid.UUID
    cidadao_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    profissional_id: uuid.UUID | None = None
    especialidade: str | None = None
    material: str | None = None
    coletado_em: datetime | None = None
    informacoes_clinicas: str | None = None
    dados_requisicao: dict
    situacao: str
    enviado_em: datetime | None = None
    prestador: str | None = None
    dados_resultado: dict | None = None
    resultado_em: datetime | None = None
    resultado_alterado: bool
    assinado_em: datetime | None = None
    assinatura_hash: str | None = None
    comunicado_em: datetime | None = None
    seguimento: str | None = None
    proximo_exame_em: date | None = None
