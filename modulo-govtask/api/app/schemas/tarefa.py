import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import Prioridade, StatusTarefa


class TarefaCreate(BaseModel):
    titulo: str = Field(..., max_length=500)
    descricao: str | None = None
    atribuida_a_id: uuid.UUID | None = None
    setor_destino_id: uuid.UUID | None = None
    prioridade: Prioridade = Prioridade.NORMAL
    prazo: datetime | None = None
    tarefa_pai_id: uuid.UUID | None = None
    recorrente: bool = False
    intervalo_recorrencia_dias: int | None = None


class TarefaUpdate(BaseModel):
    titulo: str | None = Field(None, max_length=500)
    descricao: str | None = None
    atribuida_a_id: uuid.UUID | None = None
    setor_destino_id: uuid.UUID | None = None
    prioridade: Prioridade | None = None
    prazo: datetime | None = None
    prazo_interno: datetime | None = None
    motivo_prazo: str | None = Field(None, max_length=500, description="Justificativa para a mudança de prazo")


class TarefaPrazoHistoricoOut(BaseModel):
    id: uuid.UUID
    tarefa_id: uuid.UUID
    prazo_anterior: datetime | None
    prazo_novo: datetime | None
    definido_por_id: uuid.UUID
    motivo: str | None
    tipo: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DependenciaCreate(BaseModel):
    depende_de_id: uuid.UUID = Field(..., description="Tarefa que deve ser concluída antes")


class DependenciaOut(BaseModel):
    id: uuid.UUID
    tarefa_id: uuid.UUID
    depende_de_id: uuid.UUID
    depende_de_titulo: str | None = None

    model_config = {"from_attributes": True}


class ComentarioCreate(BaseModel):
    texto: str = Field(..., min_length=1)


class ComentarioOut(BaseModel):
    id: uuid.UUID
    tarefa_id: uuid.UUID
    autor_id: uuid.UUID
    texto: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TarefaOut(BaseModel):
    id: uuid.UUID
    convenio_id: uuid.UUID
    etapa_id: uuid.UUID
    titulo: str
    descricao: str | None
    criada_por_id: uuid.UUID
    atribuida_a_id: uuid.UUID | None
    setor_destino_id: uuid.UUID | None
    prioridade: Prioridade
    prazo: datetime | None
    prazo_interno: datetime | None
    status: StatusTarefa
    tarefa_pai_id: uuid.UUID | None
    data_aceite: datetime | None
    data_entrega: datetime | None
    data_conclusao: datetime | None
    recorrente: bool
    atrasada: bool
    bloqueada_por: list[str] = []
    historico_prazos: list["TarefaPrazoHistoricoOut"] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserRefOut(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


class NomeRefOut(BaseModel):
    id: uuid.UUID
    nome: str

    model_config = {"from_attributes": True}


class ConvenioRefOut(BaseModel):
    id: uuid.UUID
    titulo: str

    model_config = {"from_attributes": True}


class TarefaListItem(BaseModel):
    id: uuid.UUID
    convenio_id: uuid.UUID
    etapa_id: uuid.UUID
    titulo: str
    descricao: str | None = None
    atribuida_a_id: uuid.UUID | None
    atribuida_a: UserRefOut | None = None
    setor_destino_id: uuid.UUID | None
    setor_destino: NomeRefOut | None = None
    etapa: NomeRefOut | None = None
    convenio: ConvenioRefOut | None = None
    prioridade: Prioridade
    prazo: datetime | None
    prazo_interno: datetime | None = None
    status: StatusTarefa
    atrasada: bool
    recorrente: bool
    created_at: datetime

    model_config = {"from_attributes": True}
