"""DTOs da Fase 1: rede de atenção, cadastros-base, escalas e importação CNES."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field

# ── Estabelecimentos / setores ──────────────────────────────────────────────


class EstabelecimentoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cnes: str = Field(min_length=7, max_length=7)
    nome: str = Field(min_length=3, max_length=200)
    tipo: str = Field(min_length=2, max_length=60)
    cnpj: str | None = Field(default=None, max_length=20)
    logradouro: str | None = Field(default=None, max_length=240)
    numero: str | None = Field(default=None, max_length=30)
    bairro: str | None = Field(default=None, max_length=120)
    municipio_ibge: str | None = Field(default=None, max_length=7)
    cep: str | None = Field(default=None, max_length=9)
    telefone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=200)


class EstabelecimentoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str | None = Field(default=None, min_length=3, max_length=200)
    tipo: str | None = Field(default=None, min_length=2, max_length=60)
    cnpj: str | None = Field(default=None, max_length=20)
    logradouro: str | None = Field(default=None, max_length=240)
    numero: str | None = Field(default=None, max_length=30)
    bairro: str | None = Field(default=None, max_length=120)
    municipio_ibge: str | None = Field(default=None, max_length=7)
    cep: str | None = Field(default=None, max_length=9)
    telefone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=200)
    ativo: bool | None = None


class BaixaRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    motivo: str = Field(min_length=10, max_length=400)
    data: datetime | None = None


class EstabelecimentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    cnes: str
    nome: str
    tipo: str
    cnpj_mascarado: str | None = None
    logradouro: str | None = None
    numero: str | None = None
    bairro: str | None = None
    municipio_ibge: str | None = None
    cep: str | None = None
    telefone: str | None = None
    email: str | None = None
    fuso_horario: str
    ativo: bool
    versao: int
    baixa_em: datetime | None = None
    baixa_motivo: str | None = None


class SetorCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str = Field(min_length=2, max_length=120)
    tipo: str = Field(default="ATENDIMENTO", min_length=2, max_length=60)


class SetorUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str | None = Field(default=None, min_length=2, max_length=120)
    tipo: str | None = Field(default=None, min_length=2, max_length=60)
    ativo: bool | None = None


class SetorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    nome: str
    tipo: str
    ativo: bool
    versao: int
    baixa_em: datetime | None = None


# ── Serviços / classificações / horários ───────────────────────────────────


class ServicoClassificacaoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tipo: str = Field(pattern="^(SERVICO|CLASSIFICACAO)$")
    codigo: str = Field(min_length=1, max_length=30)
    nome: str = Field(min_length=2, max_length=200)
    observacoes: str | None = Field(default=None, max_length=2000)


class ServicoClassificacaoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str | None = Field(default=None, min_length=2, max_length=200)
    observacoes: str | None = Field(default=None, max_length=2000)
    ativo: bool | None = None


class ServicoClassificacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    tipo: str
    codigo: str
    nome: str
    observacoes: str | None = None
    ativo: bool
    versao: int
    baixa_em: datetime | None = None


class HorarioFuncionamentoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dia_semana: int = Field(ge=0, le=6, description="0=segunda ... 6=domingo")
    hora_inicio: time
    hora_fim: time
    setor_id: uuid.UUID | None = None
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    observacoes: str | None = Field(default=None, max_length=2000)


class HorarioFuncionamentoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dia_semana: int | None = Field(default=None, ge=0, le=6)
    hora_inicio: time | None = None
    hora_fim: time | None = None
    setor_id: uuid.UUID | None = None
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    observacoes: str | None = Field(default=None, max_length=2000)
    ativo: bool | None = None


class HorarioFuncionamentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    setor_id: uuid.UUID | None = None
    dia_semana: int
    hora_inicio: time
    hora_fim: time
    vigencia_inicio: date
    vigencia_fim: date | None = None
    observacoes: str | None = None
    ativo: bool
    versao: int
    baixa_em: datetime | None = None


# ── Equipes ─────────────────────────────────────────────────────────────────


class EquipeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    estabelecimento_id: uuid.UUID
    ine: str | None = Field(default=None, min_length=10, max_length=10)
    nome: str = Field(min_length=2, max_length=160)
    tipo: str = Field(pattern="^(ESF|EAP|ESB|EMULTI|OUTRA)$")
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None


class EquipeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str | None = Field(default=None, min_length=2, max_length=160)
    tipo: str | None = Field(default=None, pattern="^(ESF|EAP|ESB|EMULTI|OUTRA)$")
    ine: str | None = Field(default=None, min_length=10, max_length=10)
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    ativo: bool | None = None


class EquipeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    ine: str | None = None
    nome: str
    tipo: str
    vigencia_inicio: date
    vigencia_fim: date | None = None
    ativo: bool
    versao: int
    baixa_em: datetime | None = None


# ── Profissionais / vínculos / especialidades ───────────────────────────────


class ProfissionalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str = Field(min_length=3, max_length=200)
    nome_social: str | None = Field(default=None, max_length=200)
    cpf: str | None = Field(default=None, max_length=14)
    cns: str | None = Field(default=None, max_length=20)
    cbo: str = Field(min_length=6, max_length=6)
    conselho_classe: str | None = Field(default=None, max_length=40)
    registro_conselho: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=200)
    telefone: str | None = Field(default=None, max_length=20)
    estabelecimento_id: uuid.UUID
    equipe_id: uuid.UUID | None = None
    carga_horaria_semanal: int = Field(default=40, ge=1, le=168)
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None


class ProfissionalUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str | None = Field(default=None, min_length=3, max_length=200)
    nome_social: str | None = Field(default=None, max_length=200)
    cpf: str | None = Field(default=None, max_length=14)
    cns: str | None = Field(default=None, max_length=20)
    cbo: str | None = Field(default=None, min_length=6, max_length=6)
    conselho_classe: str | None = Field(default=None, max_length=40)
    registro_conselho: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=200)
    telefone: str | None = Field(default=None, max_length=20)
    ativo: bool | None = None


class ProfissionalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    nome: str
    nome_social: str | None = None
    nome_exibicao: str
    cpf_mascarado: str | None = None
    cns_mascarado: str | None = None
    cbo: str | None = None
    conselho_classe: str | None = None
    registro_conselho: str | None = None
    email: str | None = None
    telefone: str | None = None
    ativo: bool
    versao: int
    baixa_em: datetime | None = None


class VinculoProfissionalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    estabelecimento_id: uuid.UUID
    equipe_id: uuid.UUID | None = None
    cbo: str = Field(min_length=6, max_length=6)
    carga_horaria_semanal: int = Field(default=40, ge=1, le=168)
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    observacoes: str | None = Field(default=None, max_length=2000)


class VinculoEquipeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profissional_id: uuid.UUID
    cbo: str = Field(min_length=6, max_length=6)
    carga_horaria_semanal: int = Field(default=40, ge=1, le=168)
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    observacoes: str | None = Field(default=None, max_length=2000)


class VinculoProfissionalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    profissional_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    equipe_id: uuid.UUID | None = None
    cbo: str
    carga_horaria_semanal: int
    vigencia_inicio: date
    vigencia_fim: date | None = None
    observacoes: str | None = None
    versao: int


class BuscaProfissionalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    termo: str = Field(min_length=2, max_length=120)
    limite: int = Field(default=50, ge=1, le=100)
    cursor: str | None = None
    ativo: bool | None = None
    estabelecimento_id: uuid.UUID | None = None


class ProfissionalEspecialidadeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    especialidade_id: uuid.UUID
    principal: bool = False
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None


class ProfissionalEspecialidadeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    profissional_id: uuid.UUID
    especialidade_id: uuid.UUID
    principal: bool
    vigencia_inicio: date
    vigencia_fim: date | None = None
    versao: int


# ── Escalas / plantões ──────────────────────────────────────────────────────


class TurnoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    estabelecimento_id: uuid.UUID
    setor_id: uuid.UUID | None = None
    equipe_id: uuid.UUID | None = None
    profissional_id: uuid.UUID | None = None
    data: date
    hora_inicio: time
    hora_fim: time
    tipo: str = Field(default="REGULAR", max_length=30)
    observacoes: str | None = Field(default=None, max_length=2000)
    forcar_conflito: bool = Field(
        default=False,
        description="Permite sobreposição apenas com justificativa de 20+ caracteres.",
    )
    justificativa_excecao: str | None = Field(default=None, max_length=2000)


class EscalaCreate(TurnoCreate):
    tipo: str = Field(default="REGULAR", pattern="^(REGULAR|EXTRA|SOBREAVISO)$")


class PlantaoCreate(TurnoCreate):
    tipo: str = Field(default="PRESENCIAL", pattern="^(PRESENCIAL|SOBREAVISO)$")


class TurnoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    setor_id: uuid.UUID | None = None
    equipe_id: uuid.UUID | None = None
    profissional_id: uuid.UUID | None = None
    data: date | None = None
    hora_inicio: time | None = None
    hora_fim: time | None = None
    tipo: str | None = Field(default=None, max_length=30)
    observacoes: str | None = Field(default=None, max_length=2000)
    forcar_conflito: bool = False
    justificativa_excecao: str | None = Field(default=None, max_length=2000)


class TurnoCancelamento(BaseModel):
    model_config = ConfigDict(extra="forbid")

    motivo: str = Field(min_length=10, max_length=400)


class TurnoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    setor_id: uuid.UUID | None = None
    equipe_id: uuid.UUID | None = None
    profissional_id: uuid.UUID | None = None
    data: date
    hora_inicio: time
    hora_fim: time
    tipo: str
    situacao: str
    observacoes: str | None = None
    justificativa_excecao: str | None = None
    autorizado_por_id: uuid.UUID | None = None
    autorizado_em: datetime | None = None
    ativo: bool
    versao: int
    baixa_em: datetime | None = None


# ── Procedimentos autorizados ───────────────────────────────────────────────


class ProcedimentoAutorizadoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    estabelecimento_id: uuid.UUID
    profissional_id: uuid.UUID | None = None
    especialidade_id: uuid.UUID | None = None
    codigo_sigtap: str = Field(min_length=10, max_length=10)
    competencia: str | None = Field(default=None, min_length=6, max_length=6)
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    observacoes: str | None = Field(default=None, max_length=2000)


class ProcedimentoAutorizadoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profissional_id: uuid.UUID | None = None
    especialidade_id: uuid.UUID | None = None
    competencia: str | None = Field(default=None, min_length=6, max_length=6)
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    observacoes: str | None = Field(default=None, max_length=2000)
    ativo: bool | None = None


class ProcedimentoAutorizadoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    estabelecimento_id: uuid.UUID
    profissional_id: uuid.UUID | None = None
    especialidade_id: uuid.UUID | None = None
    codigo_sigtap: str
    competencia: str | None = None
    vigencia_inicio: date
    vigencia_fim: date | None = None
    observacoes: str | None = None
    validado_referencia: bool
    aviso_referencia: str | None = None
    ativo: bool
    versao: int
    baixa_em: datetime | None = None


# ── Prioridades ─────────────────────────────────────────────────────────────


class PrioridadeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    codigo: str = Field(min_length=2, max_length=40)
    rotulo: str = Field(min_length=2, max_length=120)
    ordem: int = Field(ge=0)
    prioridade_legal: bool = False
    base_legal: str | None = Field(default=None, max_length=240)
    observacoes: str | None = Field(default=None, max_length=2000)
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None


class PrioridadeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rotulo: str | None = Field(default=None, min_length=2, max_length=120)
    ordem: int | None = Field(default=None, ge=0)
    prioridade_legal: bool | None = None
    base_legal: str | None = Field(default=None, max_length=240)
    observacoes: str | None = Field(default=None, max_length=2000)
    vigencia_fim: date | None = None
    ativo: bool | None = None


class PrioridadeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    codigo: str
    rotulo: str
    ordem: int
    prioridade_legal: bool
    base_legal: str | None = None
    observacoes: str | None = None
    vigencia_inicio: date
    vigencia_fim: date | None = None
    ativo: bool
    versao: int
    baixa_em: datetime | None = None


# ── Consórcio / entes consorciados ──────────────────────────────────────────


class EnteConsorciadoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    municipio_ibge: str = Field(min_length=7, max_length=7)
    nome: str = Field(min_length=3, max_length=200)
    cnpj: str | None = Field(default=None, max_length=20)
    situacao: str = Field(default="ATIVO", pattern="^(ATIVO|INATIVO|SUSPENSO)$")
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    observacoes: str | None = Field(default=None, max_length=2000)


class EnteConsorciadoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str | None = Field(default=None, min_length=3, max_length=200)
    cnpj: str | None = Field(default=None, max_length=20)
    situacao: str | None = Field(default=None, pattern="^(ATIVO|INATIVO|SUSPENSO)$")
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    observacoes: str | None = Field(default=None, max_length=2000)


class EnteConsorciadoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    municipio_ibge: str
    nome: str
    cnpj_mascarado: str | None = None
    situacao: str
    vigencia_inicio: date
    vigencia_fim: date | None = None
    observacoes: str | None = None
    versao: int


# ── Restrições de horário ───────────────────────────────────────────────────


class RestricaoHorarioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    usuario_id: uuid.UUID | None = None
    grupo_id: uuid.UUID | None = None
    estabelecimento_id: uuid.UUID | None = None
    dias_semana: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4, 5, 6])
    hora_inicio: time
    hora_fim: time
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    motivo: str | None = Field(default=None, max_length=400)


class RestricaoHorarioUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dias_semana: list[int] | None = None
    hora_inicio: time | None = None
    hora_fim: time | None = None
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    motivo: str | None = Field(default=None, max_length=400)
    ativo: bool | None = None


class RestricaoHorarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    usuario_id: uuid.UUID | None = None
    grupo_id: uuid.UUID | None = None
    estabelecimento_id: uuid.UUID | None = None
    dias_semana: list[int]
    hora_inicio: time
    hora_fim: time
    vigencia_inicio: date
    vigencia_fim: date | None = None
    motivo: str | None = None
    ativo: bool
    versao: int
    baixa_em: datetime | None = None


# ── Importação CNES ─────────────────────────────────────────────────────────


class ImportacaoCNESRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    versao_layout: str | None = Field(default=None, max_length=80)
    competencia: str | None = Field(default=None, min_length=6, max_length=6)


class ImportacaoCNESOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    job_id: uuid.UUID
    status: str
    arquivo_nome: str | None = None
    hash_arquivo: str | None = None
    versao_layout: str | None = None
    competencia: str | None = None
    total_linhas: int
    total_validos: int
    total_rejeitados: int
    total_criados: int
    total_atualizados: int
    conferencia_ok: bool
    relatorio: dict
    created_at: datetime
