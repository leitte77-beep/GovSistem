"""Contratos da Fase 6: programas, inscrições, programação e busca ativa."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SEXOS = {"MASCULINO", "FEMININO", "INTERSEXO", "NAO_INFORMADO", "OUTRO"}
TIPOS_CODIGO = {"CID10", "CIAP2", "CIPE", "OUTRO"}
TIPOS_PROGRAMA = {"PROGRAMA", "LINHA_CUIDADO"}
TIPOS_ITEM = {
    "CONSULTA",
    "EXAME",
    "FORNECIMENTO",
    "VACINA",
    "PROCEDIMENTO",
    "ORIENTACAO",
}
SITUACOES_INSCRICAO = {"ATIVA", "SUSPENSA", "ENCERRADA", "TRANSFERIDA"}
SITUACOES_PROGRAMACAO = {
    "PREVISTO",
    "REALIZADO",
    "REMARCADO",
    "PERDIDO",
    "CANCELADO",
}
MOTIVOS_BUSCA = {
    "ATRASO",
    "FALTA",
    "EXAME_PENDENTE",
    "FORNECIMENTO_PENDENTE",
    "OUTRO",
}
SITUACOES_BUSCA = {
    "PENDENTE",
    "CONTATADO",
    "RECUPERADO",
    "SEM_SUCESSO",
    "TRANSFERIDO",
}


class CondicaoElegibilidade(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tipo_codigo: Literal["CID10", "CIAP2", "CIPE", "OUTRO"] = "CID10"
    codigo: str = Field(min_length=1, max_length=20)


class CriteriosElegibilidade(BaseModel):
    """Critérios parametrizáveis; ausência de critério = sem restrição."""

    model_config = ConfigDict(extra="forbid")

    sexos: list[str] | None = None
    idade_min_anos: int | None = Field(default=None, ge=0, le=130)
    idade_max_anos: int | None = Field(default=None, ge=0, le=130)
    gestante: bool | None = None
    condicoes: list[CondicaoElegibilidade] = Field(default_factory=list)
    exigir_condicao: bool = False
    observacoes: str | None = Field(default=None, max_length=2000)

    @field_validator("sexos")
    @classmethod
    def validar_sexos(cls, valores: list[str] | None):
        if valores is None:
            return None
        normalizados = [str(valor).strip().upper() for valor in valores]
        invalidos = sorted(set(normalizados) - SEXOS)
        if invalidos:
            raise ValueError(f"Sexos inválidos: {', '.join(invalidos)}.")
        return normalizados

    @model_validator(mode="after")
    def validar_intervalo(self):
        if (
            self.idade_min_anos is not None
            and self.idade_max_anos is not None
            and self.idade_min_anos > self.idade_max_anos
        ):
            raise ValueError("idade_min_anos não pode ser maior que idade_max_anos.")
        return self


class ProgramaItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tipo: Literal[
        "CONSULTA",
        "EXAME",
        "FORNECIMENTO",
        "VACINA",
        "PROCEDIMENTO",
        "ORIENTACAO",
    ] = "CONSULTA"
    codigo: str | None = Field(default=None, max_length=20)
    descricao: str = Field(min_length=2, max_length=300)
    periodicidade_dias: int | None = Field(default=None, ge=1, le=3650)
    idade_min_meses: int | None = Field(default=None, ge=0, le=1560)
    idade_max_meses: int | None = Field(default=None, ge=0, le=1560)
    sexo: str | None = None
    gestante: bool | None = None
    obrigatorio: bool = True
    quantidade: int = Field(default=1, ge=1, le=999)
    unidade: str | None = Field(default=None, max_length=40)
    ordem: int = Field(default=0, ge=0, le=9999)
    observacoes: str | None = Field(default=None, max_length=4000)
    ativo: bool = True

    @field_validator("sexo")
    @classmethod
    def validar_sexo(cls, valor: str | None):
        if valor is None:
            return None
        normalizado = valor.strip().upper()
        if normalizado not in SEXOS:
            raise ValueError("Sexo inválido.")
        return normalizado

    @model_validator(mode="after")
    def validar_intervalo_idade(self):
        if (
            self.idade_min_meses is not None
            and self.idade_max_meses is not None
            and self.idade_min_meses > self.idade_max_meses
        ):
            raise ValueError(
                "idade_min_meses não pode ser maior que idade_max_meses."
            )
        return self


class ProgramaItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tipo: Literal[
        "CONSULTA",
        "EXAME",
        "FORNECIMENTO",
        "VACINA",
        "PROCEDIMENTO",
        "ORIENTACAO",
    ] | None = None
    codigo: str | None = Field(default=None, max_length=20)
    descricao: str | None = Field(default=None, min_length=2, max_length=300)
    periodicidade_dias: int | None = Field(default=None, ge=1, le=3650)
    idade_min_meses: int | None = Field(default=None, ge=0, le=1560)
    idade_max_meses: int | None = Field(default=None, ge=0, le=1560)
    sexo: str | None = None
    gestante: bool | None = None
    obrigatorio: bool | None = None
    quantidade: int | None = Field(default=None, ge=1, le=999)
    unidade: str | None = Field(default=None, max_length=40)
    ordem: int | None = Field(default=None, ge=0, le=9999)
    observacoes: str | None = Field(default=None, max_length=4000)
    ativo: bool | None = None


class ProgramaItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    programa_id: uuid.UUID
    tipo: str
    codigo: str | None = None
    descricao: str
    periodicidade_dias: int | None = None
    idade_min_meses: int | None = None
    idade_max_meses: int | None = None
    sexo: str | None = None
    gestante: bool | None = None
    obrigatorio: bool
    quantidade: int
    unidade: str | None = None
    ordem: int
    observacoes: str | None = None
    ativo: bool
    versao: int


class ProgramaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    codigo: str = Field(
        min_length=2,
        max_length=80,
        pattern=r"^[A-Z0-9][A-Z0-9_.-]*$",
        description="Código estável do programa (maiúsculas, números, _ . -).",
    )
    nome: str = Field(min_length=2, max_length=200)
    tipo: Literal["PROGRAMA", "LINHA_CUIDADO"] = "PROGRAMA"
    linha_cuidado: str | None = Field(default=None, max_length=80)
    descricao: str | None = Field(default=None, max_length=4000)
    criterios_elegibilidade: CriteriosElegibilidade = Field(
        default_factory=CriteriosElegibilidade
    )
    periodicidade_padrao_dias: int | None = Field(default=None, ge=1, le=3650)
    formulario_id: uuid.UUID | None = None
    marcador_gestante: bool = False
    base_normativa: str | None = Field(default=None, max_length=4000)
    fonte: str | None = Field(default=None, max_length=300)
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    itens: list[ProgramaItemCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validar_vigencia(self):
        if (
            self.vigencia_fim is not None
            and self.vigencia_inicio is not None
            and self.vigencia_fim < self.vigencia_inicio
        ):
            raise ValueError("vigencia_fim não pode ser anterior a vigencia_inicio.")
        return self


class ProgramaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str | None = Field(default=None, min_length=2, max_length=200)
    tipo: Literal["PROGRAMA", "LINHA_CUIDADO"] | None = None
    linha_cuidado: str | None = Field(default=None, max_length=80)
    descricao: str | None = Field(default=None, max_length=4000)
    criterios_elegibilidade: CriteriosElegibilidade | None = None
    periodicidade_padrao_dias: int | None = Field(default=None, ge=1, le=3650)
    formulario_id: uuid.UUID | None = None
    marcador_gestante: bool | None = None
    base_normativa: str | None = Field(default=None, max_length=4000)
    fonte: str | None = Field(default=None, max_length=300)
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    ativo: bool | None = None


class ProgramaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    codigo: str
    nome: str
    tipo: str
    linha_cuidado: str | None = None
    descricao: str | None = None
    criterios_elegibilidade: CriteriosElegibilidade
    periodicidade_padrao_dias: int | None = None
    formulario_id: uuid.UUID | None = None
    marcador_gestante: bool
    base_normativa: str | None = None
    fonte: str | None = None
    origem: str
    versao_programa: str
    ativo: bool
    vigencia_inicio: date
    vigencia_fim: date | None = None
    versao: int
    baixa_em: datetime | None = None
    baixa_motivo: str | None = None
    itens: list[ProgramaItemOut] = Field(default_factory=list)


class ProgramaNovaVersao(BaseModel):
    model_config = ConfigDict(extra="forbid")

    versao_programa: str = Field(min_length=1, max_length=40)
    vigencia_inicio: date = Field(default_factory=date.today)
    vigencia_fim: date | None = None
    justificativa: str = Field(min_length=3, max_length=4000)


class ElegibilidadeOut(BaseModel):
    programa_id: uuid.UUID
    cidadao_id: uuid.UUID
    elegivel: bool
    motivos: list[str]
    criterios: CriteriosElegibilidade


class InscricaoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    programa_id: uuid.UUID
    cidadao_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    equipe_id: uuid.UUID | None = None
    profissional_responsavel_id: uuid.UUID | None = None
    data_entrada: date = Field(default_factory=date.today)
    gestante: bool | None = None
    dados_clinicos: dict[str, Any] | None = None
    observacoes: str | None = Field(default=None, max_length=8000)
    justificativa_excecao: str | None = Field(default=None, max_length=4000)


class InscricaoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    situacao: Literal["ATIVA", "SUSPENSA", "ENCERRADA", "TRANSFERIDA"] | None = None
    motivo_saida: str | None = Field(default=None, max_length=4000)
    data_saida: date | None = None
    gestante: bool | None = None
    dados_clinicos: dict[str, Any] | None = None
    observacoes: str | None = Field(default=None, max_length=8000)
    equipe_id: uuid.UUID | None = None
    profissional_responsavel_id: uuid.UUID | None = None


class InscricaoEncerrar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    motivo_saida: str = Field(min_length=3, max_length=4000)
    data_saida: date = Field(default_factory=date.today)
    situacao: Literal["ENCERRADA", "TRANSFERIDA"] = "ENCERRADA"


class InscricaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    programa_id: uuid.UUID
    cidadao_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    equipe_id: uuid.UUID | None = None
    profissional_responsavel_id: uuid.UUID | None = None
    situacao: str
    motivo_saida: str | None = None
    data_entrada: date
    data_saida: date | None = None
    gestante: bool | None = None
    dados_clinicos: dict[str, Any] | None = None
    observacoes: str | None = None
    excecao_justificada: bool
    justificativa_excecao: str | None = None
    versao: int
    programa_codigo: str | None = None
    programa_nome: str | None = None
    cidadao_nome_exibicao: str | None = None
    cidadao_data_nascimento: date | None = None
    cpf_mascarado: str | None = None
    cns_mascarado: str | None = None


class ProgramacaoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    inscricao_id: uuid.UUID
    item_id: uuid.UUID
    previsto_para: date
    quantidade: int = Field(default=1, ge=1, le=999)
    observacoes: str | None = Field(default=None, max_length=8000)


class ProgramacaoRealizar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    realizado_em: date = Field(default_factory=date.today)
    quantidade: int | None = Field(default=None, ge=1, le=999)
    atendimento_id: uuid.UUID | None = None
    observacoes: str | None = Field(default=None, max_length=8000)


class ProgramacaoRemarcar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nova_data: date
    motivo: str = Field(min_length=3, max_length=4000)


class ProgramacaoPerder(BaseModel):
    model_config = ConfigDict(extra="forbid")

    motivo: str = Field(min_length=3, max_length=4000)
    criar_busca_ativa: bool = True


class ProgramacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    inscricao_id: uuid.UUID
    item_id: uuid.UUID
    tipo: str
    previsto_para: date
    realizado_em: date | None = None
    situacao: str
    quantidade: int
    atendimento_id: uuid.UUID | None = None
    observacoes: str | None = None
    responsavel_id: uuid.UUID | None = None
    remarcado_de_id: uuid.UUID | None = None
    versao: int
    item_descricao: str | None = None
    programa_id: uuid.UUID | None = None
    programa_codigo: str | None = None
    cidadao_id: uuid.UUID | None = None
    cidadao_nome_exibicao: str | None = None
    atraso_dias: int | None = None


class GerarProgramacoes(BaseModel):
    model_config = ConfigDict(extra="forbid")

    horizonte_dias: int = Field(default=90, ge=1, le=730)
    data_base: date | None = None


class GerarProgramacoesOut(BaseModel):
    inscricao_id: uuid.UUID | None = None
    programa_id: uuid.UUID | None = None
    criadas: int
    existentes: int
    itens_avaliados: int
    horizonte_dias: int
    data_base: date


class BuscaAtivaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    inscricao_id: uuid.UUID
    programacao_id: uuid.UUID | None = None
    motivo: Literal[
        "ATRASO", "FALTA", "EXAME_PENDENTE", "FORNECIMENTO_PENDENTE", "OUTRO"
    ] = "ATRASO"
    situacao: Literal[
        "PENDENTE", "CONTATADO", "RECUPERADO", "SEM_SUCESSO", "TRANSFERIDO"
    ] = "PENDENTE"
    tentativa: int = Field(default=1, ge=1, le=99)
    contato_em: datetime | None = None
    proxima_tentativa_em: date | None = None
    desfecho: str | None = Field(default=None, max_length=4000)
    observacoes: str | None = Field(default=None, max_length=8000)


class BuscaAtivaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    situacao: Literal[
        "PENDENTE", "CONTATADO", "RECUPERADO", "SEM_SUCESSO", "TRANSFERIDO"
    ] | None = None
    tentativa: int | None = Field(default=None, ge=1, le=99)
    contato_em: datetime | None = None
    proxima_tentativa_em: date | None = None
    desfecho: str | None = Field(default=None, max_length=4000)
    observacoes: str | None = Field(default=None, max_length=8000)


class BuscaAtivaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    inscricao_id: uuid.UUID
    programacao_id: uuid.UUID | None = None
    motivo: str
    situacao: str
    tentativa: int
    contato_em: datetime | None = None
    proxima_tentativa_em: date | None = None
    desfecho: str | None = None
    observacoes: str | None = None
    responsavel_id: uuid.UUID | None = None
    versao: int
    programa_codigo: str | None = None
    programa_nome: str | None = None
    cidadao_id: uuid.UUID | None = None
    cidadao_nome_exibicao: str | None = None
    previsto_para: date | None = None
    atraso_dias: int | None = None


class PendenciaBuscaAtivaOut(BaseModel):
    inscricao_id: uuid.UUID
    programacao_id: uuid.UUID
    programa_id: uuid.UUID
    programa_codigo: str
    programa_nome: str
    cidadao_id: uuid.UUID
    cidadao_nome_exibicao: str
    cpf_mascarado: str | None = None
    cns_mascarado: str | None = None
    estabelecimento_id: uuid.UUID
    item_id: uuid.UUID
    item_tipo: str
    item_descricao: str
    previsto_para: date
    atraso_dias: int
    ultima_busca_em: datetime | None = None
    situacao_busca: str | None = None


class DemandaItemOut(BaseModel):
    item_id: uuid.UUID
    tipo: str
    descricao: str
    periodicidade_dias: int | None = None
    inscritos_ativos: int
    demanda_programada: int
    demanda_estimada: int
    total_previsto: int
    memoria_calculo: dict[str, Any]


class DemandaFuturaOut(BaseModel):
    programa_id: uuid.UUID
    programa_codigo: str
    programa_nome: str
    horizonte_meses: int
    data_base: date
    itens: list[DemandaItemOut]
    total_estimado: int
    total_programado: int


class ResumoItemOut(BaseModel):
    item_id: uuid.UUID
    tipo: str
    descricao: str
    previstas: int
    realizadas: int
    perdidas: int
    atrasadas: int
    cobertura_percentual: float


class ResumoProgramaOut(BaseModel):
    programa_id: uuid.UUID
    programa_codigo: str
    programa_nome: str
    inscricoes_ativas: int
    inscricoes_suspensas: int
    programacoes_previstas: int
    programacoes_realizadas: int
    programacoes_perdidas: int
    programacoes_atrasadas: int
    cobertura_percentual: float
    itens: list[ResumoItemOut]


class ListaNominalItemOut(BaseModel):
    inscricao_id: uuid.UUID
    cidadao_id: uuid.UUID
    cidadao_nome_exibicao: str
    cpf_mascarado: str | None = None
    cns_mascarado: str | None = None
    data_nascimento: date | None = None
    estabelecimento_id: uuid.UUID
    proxima_acao: str
    previsto_para: date
    atraso_dias: int
    ultima_busca_em: datetime | None = None
    situacao_busca: str | None = None


class ListaNominalOut(BaseModel):
    programa_id: uuid.UUID
    programa_codigo: str
    programa_nome: str
    gerado_em: datetime
    itens: list[ListaNominalItemOut]
    total_estimado: int


class LinhaCuidadoOut(BaseModel):
    linha_cuidado: str
    programas: list[ProgramaOut]
