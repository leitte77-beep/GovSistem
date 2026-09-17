"""Schemas da camada de IA (§92). Sugestões, nunca informação oficial."""

from pydantic import BaseModel, Field


class IAStatus(BaseModel):
    disponivel: bool
    provedor: str
    modelo: str


class IASugestao(BaseModel):
    sugestao: str


class IADocumentosSugeridos(BaseModel):
    sugestoes: list[str] = Field(default_factory=list)
