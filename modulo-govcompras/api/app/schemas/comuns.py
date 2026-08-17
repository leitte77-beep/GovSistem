"""Schemas compartilhados por toda a API."""

import uuid
from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class Base(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class Pagina(Base, Generic[T]):
    itens: list[T]
    total: int
    pagina: int
    por_pagina: int
    paginas: int


class Criado(Base):
    id: uuid.UUID
    mensagem: str = "Registro criado com sucesso."


class Mensagem(Base):
    mensagem: str


class Justificativa(Base):
    justificativa: str = Field(..., min_length=5, max_length=2000)


class ResumoUsuario(Base):
    id: uuid.UUID
    nome: str
    perfil: str


class ResumoSetor(Base):
    id: uuid.UUID
    nome: str
    sigla: str


class HistoricoEtapaOut(Base):
    id: uuid.UUID
    etapa_id: uuid.UUID
    etapa_nome: str
    ordem_execucao: int
    responsavel_setor: str | None = None
    responsavel_usuario: str | None = None
    iniciada_em: datetime
    encerrada_em: datetime | None = None
    resultado: str
    justificativa: str | None = None
    dias_na_etapa: int | None = None


class PendenciaOut(Base):
    id: str
    descricao: str
    obrigatorio: bool
    satisfeito: bool


def pagina(itens: list[Any], total: int, pagina_atual: int, por_pagina: int) -> dict:
    return {
        "itens": itens,
        "total": total,
        "pagina": pagina_atual,
        "por_pagina": por_pagina,
        "paginas": (total + por_pagina - 1) // por_pagina if por_pagina else 0,
    }
