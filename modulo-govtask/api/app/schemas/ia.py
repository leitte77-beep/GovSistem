"""Schemas da camada de IA (§92). Sugestões, nunca informação oficial."""

import uuid

from pydantic import BaseModel, Field


class IAStatus(BaseModel):
    disponivel: bool
    provedor: str
    modelo: str


class IASugestao(BaseModel):
    sugestao: str


class IADocumentosSugeridos(BaseModel):
    sugestoes: list[str] = Field(default_factory=list)


class IAExtracaoRequest(BaseModel):
    documento_id: uuid.UUID


class IADadosExtraidos(BaseModel):
    nome_arquivo: str
    campos: dict = Field(default_factory=dict)
    trecho: str = Field(
        default="", description="Início do texto extraído, para o usuário conferir a origem"
    )


class IASemelhancaItem(BaseModel):
    id: uuid.UUID
    numero: str
    titulo: str
    motivo: str = ""
    score: int = 0


class IASemelhancas(BaseModel):
    items: list[IASemelhancaItem] = Field(default_factory=list)
    ranqueada_por_ia: bool = False
