import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class RendaMembroCreate(BaseModel):
    person_id: uuid.UUID
    tipo: str
    valor: float = Field(ge=0)
    data_inicio: Optional[date] = None
    data_fim: Optional[date] = None
    observacoes: Optional[str] = None


class RendaMembroOut(BaseModel):
    id: uuid.UUID
    person_id: uuid.UUID
    family_id: uuid.UUID
    tipo: str
    valor: float
    data_inicio: Optional[date]
    data_fim: Optional[date]
    observacoes: Optional[str]
    created_at: datetime
    updated_at: datetime


class DespesaFamiliarCreate(BaseModel):
    tipo: str
    valor: float = Field(ge=0)
    data_referencia: Optional[date] = None
    observacoes: Optional[str] = None


class DespesaFamiliarOut(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    tipo: str
    valor: float
    data_referencia: Optional[date]
    observacoes: Optional[str]
    created_at: datetime
    updated_at: datetime


class RendaDemonstrativo(BaseModel):
    family_id: uuid.UUID
    total_membros: int
    renda_familiar_total: float
    renda_per_capita: float
    renda_com_programas: float
    renda_com_programas_per_capita: float
    renda_sem_programas: float
    renda_sem_programas_per_capita: float
    total_despesas: float
    despesas_per_capita: float
    faixa_renda: str
    rendas: list[RendaMembroOut]
    despesas: list[DespesaFamiliarOut]


class DadosRuaCreate(BaseModel):
    pessoa_referencia_id: Optional[uuid.UUID] = None
    tempo_em_situacao_rua: Optional[str] = None
    motivo: Optional[str] = None
    local_pernoite: Optional[str] = None
    possui_acompanhamento_institucional: Optional[bool] = None
    instituicao_acompanhamento: Optional[str] = None
    tempo_permanencia_municipio: Optional[str] = None
    origem_municipio: Optional[str] = None
    origem_uf: Optional[str] = None
    referencias_familiares: Optional[str] = None
    observacoes: Optional[str] = None


class DadosRuaOut(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    pessoa_referencia_id: Optional[uuid.UUID]
    tempo_em_situacao_rua: Optional[str]
    motivo: Optional[str]
    local_pernoite: Optional[str]
    possui_acompanhamento_institucional: Optional[bool]
    instituicao_acompanhamento: Optional[str]
    tempo_permanencia_municipio: Optional[str]
    origem_municipio: Optional[str]
    origem_uf: Optional[str]
    referencias_familiares: Optional[str]
    observacoes: Optional[str]
    created_at: datetime
    updated_at: datetime


class CondicoesSaudeCreate(BaseModel):
    data_coleta: date
    presenca_gestantes: bool = False
    quantidade_gestantes: Optional[int] = 0
    presenca_nutrizes: bool = False
    quantidade_nutrizes: Optional[int] = 0
    pessoas_deficiencia_cuidado_terceiros: Optional[int] = 0
    pessoas_doencas_cronicas: Optional[bool] = False
    descricao_doencas_cronicas: Optional[str] = None
    pessoas_transtornos_mentais: Optional[bool] = False
    descricao_transtornos: Optional[str] = None
    uso_substancias: Optional[bool] = False
    descricao_uso_substancias: Optional[str] = None
    acesso_servicos_saude: Optional[str] = None
    uso_medicamentos_controlados: Optional[bool] = False
    observacoes: Optional[str] = None


class CondicoesSaudeOut(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    data_coleta: date
    profissional_id: Optional[uuid.UUID]
    presenca_gestantes: bool
    quantidade_gestantes: Optional[int]
    presenca_nutrizes: bool
    quantidade_nutrizes: Optional[int]
    pessoas_deficiencia_cuidado_terceiros: Optional[int]
    pessoas_doencas_cronicas: Optional[bool]
    descricao_doencas_cronicas: Optional[str]
    pessoas_transtornos_mentais: Optional[bool]
    descricao_transtornos: Optional[str]
    uso_substancias: Optional[bool]
    descricao_uso_substancias: Optional[str]
    acesso_servicos_saude: Optional[str]
    uso_medicamentos_controlados: Optional[bool]
    observacoes: Optional[str]
    created_at: datetime


class CondicoesEducacionaisCreate(BaseModel):
    data_coleta: date
    alfabetizacao_familiar: Optional[str] = None
    membros_distorcao_idade_serie: Optional[int] = 0
    membros_fora_escola: Optional[int] = 0
    detalhe_fora_escola: Optional[str] = None
    membros_creche_pre_escola: Optional[int] = 0
    acesso_educacao_infantil: Optional[bool] = False
    observacoes: Optional[str] = None


class CondicoesEducacionaisOut(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    data_coleta: date
    profissional_id: Optional[uuid.UUID]
    alfabetizacao_familiar: Optional[str]
    membros_distorcao_idade_serie: Optional[int]
    membros_fora_escola: Optional[int]
    detalhe_fora_escola: Optional[str]
    membros_creche_pre_escola: Optional[int]
    acesso_educacao_infantil: Optional[bool]
    observacoes: Optional[str]
    created_at: datetime


class ConvivenciaFamiliarCreate(BaseModel):
    data_coleta: date
    relacionamento_familiar: Optional[str] = None
    presenca_violencia_domestica: Optional[bool] = False
    presenca_trabalho_infantil: Optional[bool] = False
    medidas_protetivas: Optional[bool] = False
    detalhe_medidas_protetivas: Optional[str] = None
    participacao_comunitaria: Optional[bool] = False
    detalhe_participacao: Optional[str] = None
    vinculos_comunitarios: Optional[str] = None
    observacoes: Optional[str] = None


class ConvivenciaFamiliarOut(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    data_coleta: date
    profissional_id: Optional[uuid.UUID]
    relacionamento_familiar: Optional[str]
    presenca_violencia_domestica: Optional[bool]
    presenca_trabalho_infantil: Optional[bool]
    medidas_protetivas: Optional[bool]
    detalhe_medidas_protetivas: Optional[str]
    participacao_comunitaria: Optional[bool]
    detalhe_participacao: Optional[str]
    vinculos_comunitarios: Optional[str]
    observacoes: Optional[str]
    created_at: datetime


class VulnerabilidadeFamiliarCreate(BaseModel):
    tipo: str
    data_inicio: date
    observacoes: Optional[str] = None


class VulnerabilidadeFamiliarOut(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    tipo: str
    data_inicio: date
    data_saida: Optional[date]
    profissional_id: Optional[uuid.UUID]
    observacoes: Optional[str]
    created_at: datetime


class PotencialidadeFamiliarCreate(BaseModel):
    descricao: str
    data_identificacao: date


class PotencialidadeFamiliarOut(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    descricao: str
    data_identificacao: date
    profissional_id: Optional[uuid.UUID]
    created_at: datetime
