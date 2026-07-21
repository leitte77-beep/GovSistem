import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class FaceCadastrarRequest(BaseModel):
    person_id: uuid.UUID
    foto_base64: Optional[str] = Field(
        None, description="Imagem em base64 (JPEG/PNG)"
    )
    metodo: str = Field(
        default="FOTO_SIMPLES",
        pattern="^(FOTO_SIMPLES|BIOMETRIA)$",
    )


class FaceVerificarRequest(BaseModel):
    person_id: uuid.UUID
    foto_base64: Optional[str] = Field(
        None, description="Imagem em base64 para verificação"
    )


class FaceOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    person_id: uuid.UUID
    foto_url: Optional[str] = None
    face_encoding: Optional[dict] = None
    status: str
    metodo_verificacao: str
    data_cadastro: Optional[datetime] = None
    data_ultima_verificacao: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FaceVerificarOut(BaseModel):
    match: bool
    confianca: float
    motivo: Optional[str] = None


class FacePendenteOut(BaseModel):
    person_id: uuid.UUID
    nome: str
    cpf: Optional[str] = None
    nis: Optional[str] = None
    status_face: str
    face_id: Optional[uuid.UUID] = None
    data_cadastro_face: Optional[datetime] = None
