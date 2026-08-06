"""Schemas compartilhados por toda a API."""

import uuid
from datetime import date, datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class Base(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class Pagina(Base, Generic[T]):
    """Envelope padrão de listagem — igual em todos os módulos do sistema."""

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


class Coordenada(Base):
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    precisao_coordenada: str | None = None


class ResumoUsuario(Base):
    id: uuid.UUID
    nome: str
    perfil: str


class Justificativa(Base):
    justificativa: str = Field(..., min_length=5, max_length=2000)


class MotivoOpcional(Base):
    motivo: str | None = Field(None, max_length=2000)


class ImpedimentoOut(Base):
    codigo: str
    mensagem: str
    permite_excecao: bool
    detalhes: dict = {}


class ElegibilidadeOut(Base):
    elegivel: bool
    impedimentos: list[ImpedimentoOut] = []
    avisos: list[str] = []
    permite_excecao: bool = False


class ConflitoOut(Base):
    codigo: str
    mensagem: str
    recurso_tipo: str | None = None
    recurso_id: str | None = None
    detalhes: dict = {}


class OpcaoDataOut(Base):
    data: date
    pontuacao: int
    viavel: bool
    confianca: str
    explicacao: str
    motivos_favoraveis: list[str] = []
    alertas: list[str] = []
    impedimentos: list[str] = []
    recursos: dict = {}
    ocupacao_percentual: int = 0
    distancia_estimada_km: float | None = None


class ArquivoOut(Base):
    id: uuid.UUID
    nome: str
    categoria: str
    mime_type: str
    tamanho_bytes: int
    enviado_em: datetime
    observacao: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    capturado_em: datetime | None = None
    e_imagem: bool = False
    e_video: bool = False


class AssinaturaEntrada(Base):
    """Assinatura simples coletada na tela (item 41).

    Deixa explícito o método usado: `desenhada` e `codigo` são assinaturas de
    recebimento, não assinatura digital qualificada.
    """

    papel: str
    nome_assinante: str = Field(..., min_length=3, max_length=200)
    documento_assinante: str | None = None
    metodo: str = "desenhada"
    imagem_base64: str | None = None
    observacao: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class HistoricoOut(Base):
    id: uuid.UUID
    situacao_anterior: str | None = None
    situacao_nova: str
    justificativa: str | None = None
    observacoes: str | None = None
    created_at: datetime
    usuario: str | None = None


def pagina(itens: list[Any], total: int, pagina_atual: int, por_pagina: int) -> dict:
    return {
        "itens": itens,
        "total": total,
        "pagina": pagina_atual,
        "por_pagina": por_pagina,
        "paginas": (total + por_pagina - 1) // por_pagina if por_pagina else 0,
    }
