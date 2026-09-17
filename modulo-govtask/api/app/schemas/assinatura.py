"""Schemas da assinatura de documento (§78)."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import StatusAssinatura
from app.schemas.demanda import PessoaOut


class AssinaturaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    demanda_id: uuid.UUID
    documento_grupo_id: uuid.UUID
    anexo_id: Optional[uuid.UUID] = None
    status: StatusAssinatura
    solicitado_por: Optional[PessoaOut] = None
    solicitado_em: Optional[datetime] = None
    revisado_em: Optional[datetime] = None
    assinado_por: Optional[PessoaOut] = None
    assinado_em: Optional[datetime] = None
    referencia_externa: Optional[str] = None
    provedor: Optional[str] = None
    hash_assinado: Optional[str] = None
    motivo_cancelamento: Optional[str] = None


class AssinaturaSolicitar(BaseModel):
    anexo_id: Optional[uuid.UUID] = Field(
        default=None, description="Versão a assinar; ausente usa a versão corrente do grupo"
    )


class AssinaturaCancelar(BaseModel):
    motivo: str = Field(min_length=5)


class AssinaturaRegistrarInterno(BaseModel):
    """Evidência devolvida pelo módulo de assinatura (rota interna).

    Referência e hash são obrigatórios: sem eles não há como distinguir uma
    assinatura real de um status trocado na mão.
    """

    demanda_id: uuid.UUID
    documento_grupo_id: uuid.UUID
    referencia: str = Field(min_length=3, max_length=255)
    hash_assinado: str = Field(min_length=8, max_length=128)
    provedor: Optional[str] = Field(default=None, max_length=60)
    assinado_por_email: Optional[str] = None
