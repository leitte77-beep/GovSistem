import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


GATILHOS = {
    "TAREFA_CRIADA", "TAREFA_CONCLUIDA", "TAREFA_ENTREGUE", "TAREFA_DEVOLVIDA",
    "DEMANDA_CRIADA", "DEMANDA_BLOQUEADA", "DEMANDA_CONCLUIDA",
    "PROTOCOLO_REGISTRADO", "ANEXO_ADICIONADO", "PRAZO_PROXIMO", "PRAZO_VENCIDO",
}
ACOES = {"NOTIFICAR", "CRIAR_TAREFA", "ATUALIZAR_ETAPA", "GERAR_RESUMO"}


class AutomacaoCriar(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nome: str = Field(min_length=3, max_length=160)
    descricao: Optional[str] = Field(default=None, max_length=4000)
    gatilho: str
    condicao: Optional[dict] = None
    acoes: list[dict] = Field(min_length=1, max_length=10)
    ativo: bool = True

    @field_validator("gatilho")
    @classmethod
    def validar_gatilho(cls, value: str) -> str:
        if value not in GATILHOS:
            raise ValueError(f"Gatilho inválido. Use um de {sorted(GATILHOS)}")
        return value

    @model_validator(mode="after")
    def validar_acoes(self):
        for acao in self.acoes:
            if acao.get("tipo") not in ACOES:
                raise ValueError(f"Ação inválida: {acao.get('tipo')}")
            if acao["tipo"] == "CRIAR_TAREFA" and not acao.get("titulo"):
                raise ValueError("CRIAR_TAREFA exige titulo")
        return self


class AutomacaoAtualizar(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nome: Optional[str] = Field(default=None, min_length=3, max_length=160)
    descricao: Optional[str] = Field(default=None, max_length=4000)
    condicao: Optional[dict] = None
    acoes: Optional[list[dict]] = Field(default=None, min_length=1, max_length=10)
    ativo: Optional[bool] = None

    @model_validator(mode="after")
    def validar_acoes(self):
        if self.acoes is None:
            return self
        for acao in self.acoes:
            if acao.get("tipo") not in ACOES:
                raise ValueError(f"Ação inválida: {acao.get('tipo')}")
            if acao["tipo"] == "CRIAR_TAREFA" and not acao.get("titulo"):
                raise ValueError("CRIAR_TAREFA exige titulo")
        return self


class AutomacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    nome: str
    descricao: Optional[str] = None
    gatilho: str
    condicao: Optional[dict] = None
    acoes: list[dict]
    ativo: bool
    created_at: datetime
    updated_at: datetime
