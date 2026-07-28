"""Schemas para o modulo de IA (geracao de documentos)."""
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AIConfigCreate(BaseModel):
    """Payload para criar ou atualizar a configuracao de IA do tenant."""

    email: str = Field(
        ...,
        max_length=255,
        description="Email da conta OpenAI (identificador, armazenado em texto plano)",
    )
    password: str = Field(
        ...,
        min_length=1,
        description="API key da OpenAI (sera criptografada com Fernet em repouso)",
    )
    enabled: bool = Field(
        default=True,
        description="Habilita/desabilita o servico de IA para este tenant",
    )
    model: str = Field(
        default="gpt-4o-mini",
        max_length=50,
    )
    max_tokens: int = Field(
        default=4096,
        ge=256,
        le=16384,
        description="Numero maximo de tokens na resposta",
    )


class AIConfigOut(BaseModel):
    """Retorno da configuracao (sem a senha criptografada)."""

    id: uuid.UUID
    tenant_id: str
    provider: str
    email: str
    enabled: bool
    model: str
    max_tokens: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GenerateRequest(BaseModel):
    """Payload para geracao de documento."""

    template_type: str = Field(
        ...,
        description=(
            "Tipo de documento a gerar: "
            "relatorio_social, oficio, evolucao, declaracao, parecer_tecnico"
        ),
    )
    context: dict = Field(
        ...,
        description="Dados da familia/pessoa para contextualizar o documento",
    )


class GenerateResponse(BaseModel):
    """Documento gerado pela IA."""

    template_type: str
    documento: str
    tokens_usados: Optional[int] = None
